import { useMemo, useState } from 'react'
import { confirmAction } from '../lib/confirm'
import { catalog, type TweakRecord } from '../lib/catalog'
import { isTransactionActionEligible } from '../lib/optimizationSession'
import {
  applyTransaction,
  dpcSnapshot,
  listApplied,
  networkAuditProbe,
  pingProbe,
  revertTweak,
  type DpcSnapshot,
  type NetworkAudit,
  type PingResult,
  type TweakAction,
} from '../lib/tauri'
import { useIsVip } from '../store/useVipStore'

/**
 * A small, closed-loop NIC experiment. It deliberately stays separate from
 * Tune Now: one change is applied, the same probes run again, and a clear
 * regression or an unusable post-check restores the catalog receipt.
 */

const NETWORK_EXPERIMENT_IDS = [
  'net.nic.rss.enable',
  'net.nic.interrupt-moderation.disable',
  'net.nic.rsc.disable',
  'net.nic.lso.disable',
  'net.nic.flow-control.disable',
  'net.nic.eee-powersave.disable',
] as const

const MEASUREMENT_ROUNDS = 2

type ProbeTarget = [label: string, target: string]
type ExperimentPhase = 'baseline' | 'applying' | 'after' | 'reverting' | 'complete' | 'error'
type ExperimentDecision = 'undecided' | 'kept' | 'reverted'
type ExperimentVerdict = 'improved' | 'neutral' | 'regression' | 'unknown'

interface MeasurementTarget {
  label: string
  target: string
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
  received: number
  sent: number
  lossPercent: number
}

interface NetworkMeasurement {
  targets: MeasurementTarget[]
  packetsSent: number
  packetsReceived: number
  lossPercent: number
  meanRttMs: number | null
  worstJitterMs: number | null
  dpc: DpcSnapshot | null
  capturedAt: string
}

interface MeasurementComparison {
  verdict: ExperimentVerdict
  reason: string
  commonTargets: number
  rttDeltaMs: number | null
  jitterDeltaMs: number | null
  lossDeltaPercent: number | null
  dpcDeltaPercent: number | null
}

interface ExperimentState {
  tweakId: string
  title: string
  phase: ExperimentPhase
  decision: ExperimentDecision
  receiptId: string | null
  baseline: NetworkMeasurement | null
  after: NetworkMeasurement | null
  comparison: MeasurementComparison | null
  message: string | null
}

interface Props {
  audit: NetworkAudit
  onAuditUpdated: (audit: NetworkAudit) => void
}

type ScriptAction = Extract<TweakAction, { kind: 'powershell_script' }>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function errorText(error: unknown): string {
  return typeof error === 'string' ? error : (error as Error)?.message ?? String(error)
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatMs(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} ms`
}

function formatPercent(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`
}

function experimentTweakFor(id: string): TweakRecord | null {
  const tweak = catalog.tweaks.find((candidate) => candidate.id === id)
  if (!tweak) return null
  const hasSupportedScript = tweak.actions.some(
    (action) => action.kind === 'powershell_script' && isTransactionActionEligible(action),
  )
  return hasSupportedScript ? tweak : null
}

function experimentActionFor(tweak: TweakRecord): ScriptAction | null {
  const action = tweak.actions.find(
    (candidate): candidate is ScriptAction =>
      candidate.kind === 'powershell_script' && isTransactionActionEligible(candidate),
  )
  return action ?? null
}

function testTargets(audit: NetworkAudit): ProbeTarget[] {
  const targets: ProbeTarget[] = []
  if (audit.gatewayIpv4) targets.push(['Gateway', audit.gatewayIpv4])
  targets.push(['Cloudflare DNS', '1.1.1.1'])
  targets.push(['Fortnite edge', 'ping.ds.on.epicgames.com'])
  return targets
}

function aggregatePingResults(targets: ProbeTarget[], rounds: PingResult[][]): MeasurementTarget[] {
  return targets.map(([label, target]) => {
    const samples = rounds
      .flatMap((round) => round)
      .filter((result) => result.target === target)
    const sent = samples.length * 4
    const received = samples.reduce((sum, result) => sum + result.received, 0)
    const valid = samples.filter((result) => result.avgMs != null && result.received > 0)
    const avgMs = received > 0
      ? samples.reduce((sum, result) => sum + (result.avgMs ?? 0) * result.received, 0) / received
      : null
    const minValues = valid.flatMap((result) => result.minMs == null ? [] : [result.minMs])
    const maxValues = valid.flatMap((result) => result.maxMs == null ? [] : [result.maxMs])
    const minMs = minValues.length > 0 ? Math.min(...minValues) : null
    const maxMs = maxValues.length > 0 ? Math.max(...maxValues) : null
    return {
      label,
      target,
      avgMs,
      minMs,
      maxMs,
      received,
      sent,
      lossPercent: sent > 0 ? ((sent - received) / sent) * 100 : 100,
    }
  })
}

async function measureNetwork(targets: ProbeTarget[]): Promise<NetworkMeasurement> {
  const rounds: PingResult[][] = []
  for (let round = 0; round < MEASUREMENT_ROUNDS; round += 1) {
    rounds.push(await pingProbe(targets))
  }

  const targetRows = aggregatePingResults(targets, rounds)
  const usable = targetRows.filter((target) => target.avgMs != null)
  if (usable.length === 0) {
    throw new Error('No gateway or Internet probe replied. The experiment was not changed.')
  }

  const packetsSent = targetRows.reduce((sum, target) => sum + target.sent, 0)
  const packetsReceived = targetRows.reduce((sum, target) => sum + target.received, 0)
  return {
    targets: targetRows,
    packetsSent,
    packetsReceived,
    lossPercent: packetsSent > 0 ? ((packetsSent - packetsReceived) / packetsSent) * 100 : 100,
    meanRttMs: average(usable.flatMap((target) => target.avgMs == null ? [] : [target.avgMs])),
    worstJitterMs: usable.length > 0
      ? Math.max(...usable.map((target) =>
        target.minMs == null || target.maxMs == null ? 0 : target.maxMs - target.minMs,
      ))
      : null,
    dpc: await dpcSnapshot().catch(() => null),
    capturedAt: new Date().toISOString(),
  }
}

function compareMeasurements(
  baseline: NetworkMeasurement,
  after: NetworkMeasurement,
): MeasurementComparison {
  const afterByTarget = new Map(after.targets.map((target) => [target.target, target]))
  const common = baseline.targets
    .map((target) => [target, afterByTarget.get(target.target)] as const)
    .filter((pair): pair is readonly [MeasurementTarget, MeasurementTarget] =>
      pair[1] != null && pair[0].avgMs != null && pair[1].avgMs != null,
    )

  if (common.length < 2) {
    return {
      verdict: 'unknown',
      reason: 'Fewer than two identical probe targets replied on both sides, so the result is not safe to interpret.',
      commonTargets: common.length,
      rttDeltaMs: null,
      jitterDeltaMs: null,
      lossDeltaPercent: null,
      dpcDeltaPercent: null,
    }
  }

  const beforeRtt = average(common.map(([before]) => before.avgMs ?? 0))
  const afterRtt = average(common.map(([, current]) => current.avgMs ?? 0))
  const beforeJitter = average(common.map(([before]) =>
    before.minMs == null || before.maxMs == null ? 0 : before.maxMs - before.minMs,
  ))
  const afterJitter = average(common.map(([, current]) =>
    current.minMs == null || current.maxMs == null ? 0 : current.maxMs - current.minMs,
  ))
  const beforeLoss = average(common.map(([before]) => before.lossPercent))
  const afterLoss = average(common.map(([, current]) => current.lossPercent))
  const rttDeltaMs = beforeRtt == null || afterRtt == null ? null : afterRtt - beforeRtt
  const jitterDeltaMs = beforeJitter == null || afterJitter == null ? null : afterJitter - beforeJitter
  const lossDeltaPercent = beforeLoss == null || afterLoss == null ? null : afterLoss - beforeLoss
  const dpcDeltaPercent = baseline.dpc && after.dpc
    ? after.dpc.totalDpcPercent - baseline.dpc.totalDpcPercent
    : null

  // The thresholds intentionally require a visible signal across repeated
  // probes. A one-packet fluctuation or a sub-millisecond change is noise,
  // not a reason to rewrite a user's NIC configuration.
  const regressionReasons: string[] = []
  if (lossDeltaPercent != null && lossDeltaPercent >= 8) {
    regressionReasons.push(`packet loss rose ${lossDeltaPercent.toFixed(1)} points`)
  }
  if (rttDeltaMs != null && rttDeltaMs >= 2) {
    regressionReasons.push(`mean RTT rose ${rttDeltaMs.toFixed(1)} ms`)
  }
  if (jitterDeltaMs != null && jitterDeltaMs >= 3) {
    regressionReasons.push(`jitter rose ${jitterDeltaMs.toFixed(1)} ms`)
  }
  if (dpcDeltaPercent != null && dpcDeltaPercent >= 2.5 && after.dpc && after.dpc.totalDpcPercent >= 5) {
    regressionReasons.push(`DPC load rose ${dpcDeltaPercent.toFixed(1)} points`)
  }
  if (regressionReasons.length > 0) {
    return {
      verdict: 'regression',
      reason: `The post-check was worse: ${regressionReasons.join('; ')}. The change should be reverted.`,
      commonTargets: common.length,
      rttDeltaMs,
      jitterDeltaMs,
      lossDeltaPercent,
      dpcDeltaPercent,
    }
  }

  const improvementReasons: string[] = []
  if (lossDeltaPercent != null && lossDeltaPercent <= -8) {
    improvementReasons.push(`packet loss fell ${Math.abs(lossDeltaPercent).toFixed(1)} points`)
  }
  if (rttDeltaMs != null && rttDeltaMs <= -1.5) {
    improvementReasons.push(`mean RTT fell ${Math.abs(rttDeltaMs).toFixed(1)} ms`)
  }
  if (jitterDeltaMs != null && jitterDeltaMs <= -2) {
    improvementReasons.push(`jitter fell ${Math.abs(jitterDeltaMs).toFixed(1)} ms`)
  }
  if (dpcDeltaPercent != null && dpcDeltaPercent <= -1.5) {
    improvementReasons.push(`DPC load fell ${Math.abs(dpcDeltaPercent).toFixed(1)} points`)
  }
  return {
    verdict: improvementReasons.length > 0 ? 'improved' : 'neutral',
    reason: improvementReasons.length > 0
      ? `The probe moved in a better direction: ${improvementReasons.join('; ')}. This is a local proxy, not a guarantee of lower Fortnite server ping.`
      : 'No clear improvement or regression crossed the safety thresholds. Keep it only if your actual Fortnite frametime and packet-loss tests also look better.',
    commonTargets: common.length,
    rttDeltaMs,
    jitterDeltaMs,
    lossDeltaPercent,
    dpcDeltaPercent,
  }
}

function MeasurementSummary({ label, measurement }: { label: string; measurement: NetworkMeasurement }) {
  return (
    <div className="rounded-md border border-border bg-bg-raised/40 p-2.5 space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <p><span className="text-text-subtle">Mean RTT:</span> {formatMs(measurement.meanRttMs)}</p>
        <p><span className="text-text-subtle">Worst jitter:</span> {formatMs(measurement.worstJitterMs)}</p>
        <p><span className="text-text-subtle">Packet loss:</span> {formatPercent(measurement.lossPercent)}</p>
        <p><span className="text-text-subtle">DPC load:</span> {formatPercent(measurement.dpc?.totalDpcPercent ?? null)}</p>
      </div>
      <p className="text-[10px] text-text-subtle">
        {measurement.packetsReceived}/{measurement.packetsSent} packets received · {new Date(measurement.capturedAt).toLocaleTimeString()}
      </p>
    </div>
  )
}

function Delta({ value, suffix = ' ms' }: { value: number | null; suffix?: string }) {
  if (value == null) return <span>—</span>
  return <span className={value < 0 ? 'text-emerald-300' : value > 0 ? 'text-amber-200' : 'text-text'}>{value > 0 ? '+' : ''}{value.toFixed(1)}{suffix}</span>
}

export function NetworkExperimentCard({ audit, onAuditUpdated }: Props) {
  const isVip = useIsVip()
  const options = useMemo(
    () => NETWORK_EXPERIMENT_IDS
      .map((id) => experimentTweakFor(id))
      .filter((tweak): tweak is TweakRecord => tweak != null),
    [],
  )
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? '')
  const [experiment, setExperiment] = useState<ExperimentState | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = options.find((tweak) => tweak.id === selectedId) ?? options[0] ?? null
  const selectedAction = selected ? experimentActionFor(selected) : null
  const targets = testTargets(audit)
  const selectedIsLocked = selected?.vipGate === 'vip' && !isVip
  const running = busy || (experiment != null && ['baseline', 'applying', 'after', 'reverting'].includes(experiment.phase))

  async function refreshLiveAdapter(): Promise<void> {
    try {
      onAuditUpdated(await networkAuditProbe())
    } catch {
      // The experiment result is still useful if a second audit is unavailable.
    }
  }

  async function startExperiment(): Promise<void> {
    if (!selected || !selectedAction || selectedIsLocked || running) return
    if (targets.length < 2) {
      setExperiment({
        tweakId: selected.id,
        title: selected.title,
        phase: 'error',
        decision: 'undecided',
        receiptId: null,
        baseline: null,
        after: null,
        comparison: null,
        message: 'At least two probe targets are required for a useful before/after test.',
      })
      return
    }

    const confirmed = await confirmAction(
      `Run a measured network experiment for "${selected.title}"? It will apply only this one catalog action, run two probe rounds before and after, and automatically revert a clear regression or an unusable post-check.`,
    )
    if (!confirmed) return

    setBusy(true)
    let receiptId: string | null = null
    setExperiment({
      tweakId: selected.id,
      title: selected.title,
      phase: 'baseline',
      decision: 'undecided',
      receiptId: null,
      baseline: null,
      after: null,
      comparison: null,
      message: null,
    })

    try {
      const active = await listApplied()
      if (active.some((row) => row.status === 'applied' && row.tweakId === selected.id)) {
        throw new Error('This tweak is already active. Revert its existing receipt first so the experiment does not stack changes.')
      }

      const baseline = await measureNetwork(targets)
      setExperiment((current) => current ? { ...current, baseline, phase: 'applying' } : current)

      const report = await applyTransaction([{ tweakId: selected.id, action: selectedAction }])
      const item = report.items[0]
      if (report.status !== 'committed' || !item?.receiptId || item.verificationStatus !== 'verified') {
        const detail = report.errors.join('; ') || item?.detail || 'The native transaction did not commit a verified change.'
        throw new Error(detail)
      }
      receiptId = item.receiptId
      setExperiment((current) => current ? { ...current, receiptId, phase: 'after' } : current)

      // Let a driver property change settle before the second identical probe.
      await sleep(1500)
      const after = await measureNetwork(targets)
      const comparison = compareMeasurements(baseline, after)
      setExperiment((current) => current ? { ...current, after, comparison } : current)

      if (comparison.verdict === 'regression' || comparison.verdict === 'unknown') {
        setExperiment((current) => current ? { ...current, phase: 'reverting' } : current)
        await revertTweak(receiptId)
        receiptId = null
        setExperiment((current) => current ? {
          ...current,
          phase: 'complete',
          decision: 'reverted',
          receiptId: null,
          message: comparison.verdict === 'regression'
            ? `Automatically reverted. ${comparison.reason}`
            : 'Automatically reverted because the post-check was inconclusive. A measured experiment must not leave an unproven change active.',
        } : current)
      } else {
        setExperiment((current) => current ? {
          ...current,
          phase: 'complete',
          decision: 'undecided',
          message: comparison.reason,
        } : current)
      }
      await refreshLiveAdapter()
    } catch (error) {
      let message = errorText(error)
      if (receiptId) {
        try {
          await revertTweak(receiptId)
          receiptId = null
          message = `${message} The applied change was automatically reverted.`
        } catch (revertError) {
          message = `${message} Automatic rollback failed: ${errorText(revertError)}. Use the active receipt in Diff to revert it.`
        }
      }
      setExperiment((current) => current ? {
        ...current,
        phase: 'error',
        decision: receiptId ? 'undecided' : 'reverted',
        receiptId,
        message,
      } : current)
      await refreshLiveAdapter()
    } finally {
      setBusy(false)
    }
  }

  async function revertExperiment(): Promise<void> {
    if (!experiment?.receiptId || running) return
    setBusy(true)
    setExperiment((current) => current ? { ...current, phase: 'reverting' } : current)
    try {
      await revertTweak(experiment.receiptId)
      setExperiment((current) => current ? {
        ...current,
        phase: 'complete',
        decision: 'reverted',
        receiptId: null,
        message: 'Reverted and marked inactive. Re-probe the adapter if you want to confirm the driver value.',
      } : current)
      await refreshLiveAdapter()
    } catch (error) {
      setExperiment((current) => current ? {
        ...current,
        phase: 'error',
        message: `Revert failed: ${errorText(error)}. The active receipt remains available in Diff.`,
      } : current)
    } finally {
      setBusy(false)
    }
  }

  if (!selected) return null

  return (
    <section className="rounded-md border border-violet-400/30 bg-violet-400/5 p-3 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-violet-200 font-semibold">
          Measured NIC experiment
        </p>
        <h4 className="text-sm font-semibold text-text mt-0.5">Test one adapter change before keeping it</h4>
        <p className="text-[11px] text-text-muted leading-relaxed mt-1">
          This runs two identical rounds against your gateway, Cloudflare, and a Fortnite edge target before and after one catalog action. It compares RTT, packet loss, jitter, and available DPC load. It is a local network proxy, not a promise of lower in-match server ping.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-text-subtle">Change to test</span>
          <select
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={running}
            className="w-full rounded-md border border-border bg-bg-raised px-2.5 py-2 text-xs text-text disabled:opacity-50"
          >
            {options.map((tweak) => (
              <option key={tweak.id} value={tweak.id}>
                {tweak.title}{tweak.vipGate === 'vip' ? ' · VIP' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={startExperiment}
          disabled={running || selectedIsLocked}
          className="rounded-md border border-violet-300/50 bg-violet-400/15 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-400/25 disabled:opacity-50"
        >
          {running ? 'Testing…' : selectedIsLocked ? 'VIP experiment' : 'Run measured test'}
        </button>
      </div>

      <div className="rounded-md border border-border bg-bg-raised/30 p-2.5 space-y-1 text-[11px] leading-relaxed">
        <p><span className="text-text-subtle">What it changes:</span> {selected.description}</p>
        <p><span className="text-text-subtle">Trade-off:</span> {selected.expectedImpact ?? selected.rationale}</p>
        {selectedIsLocked && (
          <p className="text-amber-200">This catalog action is VIP-gated. It is shown here so the test scope is clear; no change can run while the current tier is free.</p>
        )}
        <p className="text-text-subtle">TCP ACK/Nagle is intentionally not in this live test: it requires a reboot and affects TCP traffic, while Fortnite gameplay is primarily UDP.</p>
      </div>

      {experiment && (
        <div className="rounded-md border border-border bg-bg-raised/40 p-2.5 space-y-2">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className="text-xs font-semibold text-text">{experiment.title}</p>
            <span className={`text-[10px] uppercase tracking-widest ${
              experiment.comparison?.verdict === 'regression' || experiment.decision === 'reverted'
                ? 'text-amber-200'
                : experiment.comparison?.verdict === 'improved'
                  ? 'text-emerald-300'
                  : 'text-text-subtle'
            }`}>
              {experiment.phase === 'complete' ? experiment.decision === 'reverted' ? 'reverted' : experiment.comparison?.verdict ?? 'complete' : experiment.phase}
            </span>
          </div>

          {experiment.message && (
            <p className="text-[11px] text-text-muted leading-relaxed">{experiment.message}</p>
          )}

          {experiment.baseline && experiment.after && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <MeasurementSummary label="Before" measurement={experiment.baseline} />
                <MeasurementSummary label="After" measurement={experiment.after} />
              </div>
              {experiment.comparison && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] border-t border-border pt-2">
                  <p><span className="text-text-subtle">RTT delta:</span> <Delta value={experiment.comparison.rttDeltaMs} /></p>
                  <p><span className="text-text-subtle">Jitter delta:</span> <Delta value={experiment.comparison.jitterDeltaMs} /></p>
                  <p><span className="text-text-subtle">Loss delta:</span> <Delta value={experiment.comparison.lossDeltaPercent} suffix=" points" /></p>
                  <p><span className="text-text-subtle">DPC delta:</span> <Delta value={experiment.comparison.dpcDeltaPercent} suffix=" points" /></p>
                </div>
              )}
            </>
          )}

          {experiment.receiptId && experiment.phase === 'complete' && experiment.decision === 'undecided' && (
            <div className="flex gap-2 flex-wrap pt-1">
              <button
                type="button"
                onClick={() => setExperiment((current) => current ? { ...current, decision: 'kept', message: 'Kept active. Use Diff or Re-probe later to verify persistence after a reboot or driver update.' } : current)}
                className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-400/20"
              >
                Keep active
              </button>
              <button
                type="button"
                onClick={revertExperiment}
                disabled={running}
                className="rounded-md border border-amber-300/40 bg-amber-300/10 px-2.5 py-1.5 text-[11px] text-amber-100 hover:bg-amber-300/20 disabled:opacity-50"
              >
                Revert now
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
