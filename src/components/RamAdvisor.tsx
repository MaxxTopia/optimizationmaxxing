import { useState } from 'react'
import { Link } from 'react-router-dom'
import { lookupKit } from '../lib/ramAdvisor'
import { decodeDie, type DieResult } from '../lib/ramDie'
import { assessRamTuningReadiness } from '../lib/ramReadiness'
import { inTauri, spdDimms, type RamModuleInfo, type SpecProfile } from '../lib/tauri'
import { suggestSecondaries, type SecondarySuggestion } from '../lib/ramSecondaries'
import { useIsVip } from '../store/useVipStore'

/**
 * RAM Advisor card — what kit Windows/SPD reports and how to validate it.
 * No system changes are emitted from this component (BIOS work stays manual).
 *
 * Stability test launcher embeds here so users can verify before+after
 * changes from the same place.
 */
export function RamAdvisor({ spec }: { spec: SpecProfile }) {
  const { ram } = spec
  const isNative = inTauri()
  const isVip = useIsVip()
  const [spdDies, setSpdDies] = useState<DieResult[]>([])
  const [spdBusy, setSpdBusy] = useState(false)
  const [spdMsg, setSpdMsg] = useState<string | null>(null)

  async function readSpd() {
    if (spdBusy) return
    setSpdBusy(true)
    setSpdMsg(null)
    try {
      const r = await spdDimms()
      if (!r.ok) {
        setSpdMsg(r.error || 'SPD read failed.')
        return
      }
      if (!r.dimms.length) {
        setSpdMsg('No SPD returned — the SMBus may be busy. Close HWiNFO/CPU-Z/AIDA and retry.')
        return
      }
      setSpdDies(r.dimms.map(decodeDie))
    } catch (e) {
      setSpdMsg(typeof e === 'string' ? e : (e as Error).message ?? String(e))
    } finally {
      setSpdBusy(false)
    }
  }

  const spdControl = (
    <SpdDieControl
      isNative={isNative}
      busy={spdBusy}
      msg={spdMsg}
      dies={spdDies}
      onRead={readSpd}
    />
  )

  const kit = [
    ram.partNumber,
    ...(ram.modules ?? []).map((module) => module.partNumber),
  ]
    .map((partNumber) => lookupKit(partNumber))
    .find((match): match is NonNullable<typeof match> => Boolean(match)) ?? null
  const running = ram.configuredSpeedMts ?? ram.speedMts ?? 0
  const dieLabels = new Set(spdDies.map((die) => die.die).filter(Boolean))
  const suggestionSignal = dieLabels.size === 1 ? [...dieLabels][0] : null
  const manualSuggestion = suggestSecondaries(
    suggestionSignal,
    running,
    kit?.rated_voltage_v ?? null,
  )
  const readiness = assessRamTuningReadiness({
    ram,
    mobo: spec.mobo,
    kitFound: Boolean(kit),
    ratedSpeedMts: kit?.rated_speed_mts ?? null,
    dies: spdDies,
  })

  if (!kit) {
    return (
      <div className="surface-card p-5 space-y-3">
        <p className="text-xs uppercase tracking-widest text-text-subtle">ram advisor</p>
        <h3 className="text-lg font-semibold">Kit not in our database</h3>
        <p className="text-sm text-text-muted leading-relaxed">
          Your kit reports{' '}
          <code className="text-accent">
            {ram.partNumber || '(no part number)'}
          </code>{' '}
          which we haven't profiled yet — but we can read vendor/profile signals from SPD. Exact die
          revision and stable manual timings may remain unknown.
        </p>
        {spdControl}
        <DimmInventory modules={ram.modules ?? []} />
        <RamReadinessPanel readiness={readiness} />
        <ManualTuningLab
          suggestion={manualSuggestion}
          readiness={readiness}
          isVip={isVip}
          kitLabel={ram.partNumber || 'unidentified kit'}
        />
        <StabilityLauncher />
      </div>
    )
  }
  const onXmp = running > 0 && Math.abs(running - kit.rated_speed_mts) < 200
  const dropToJedec = running > 0 && running < kit.rated_speed_mts - 400

  return (
    <div className="surface-card p-5 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-text-subtle">
          ram advisor · {kit.family}
        </p>
        <h3 className="text-lg font-semibold">
          {kit.brand} {kit.model}
        </h3>
        <p className="text-sm text-text-muted">
          Part-number signal (not die proof): <span className="text-accent">{kit.profile_signal}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <KitStat
          label="Rated"
          value={`${kit.rated_speed_mts} MT/s`}
          sub={`manufacturer-rated reference: ${kit.rated_timings} @ ${kit.rated_voltage_v}V`}
        />
        <KitStat
          label="Running"
          value={running > 0 ? `${running} MT/s` : '—'}
          sub={
            running === 0
              ? 'Not detected'
              : onXmp
              ? 'XMP / EXPO active'
              : dropToJedec
              ? 'JEDEC fallback — inspect the manufacturer profile'
              : 'Manual / custom profile'
          }
          highlight={dropToJedec ? 'warn' : onXmp ? 'good' : undefined}
        />
        <KitStat
          label="Stability cfg"
          value={kit.stability_reference}
          sub="follow current test documentation"
        />
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-text-subtle mb-2">
          manufacturer profile reference (read-only)
        </p>
        <div className="border border-border rounded-md p-3 text-sm">
          <p className="text-text font-medium tabular-nums">
            {kit.rated_speed_mts} MT/s · {kit.rated_timings} · {kit.rated_voltage_v}V
          </p>
          <p className="text-xs text-text-subtle mt-1">
            Manufacturer-rated reference only. Confirm the exact current specification and board
            support list before choosing a profile; the VIP Manual Tuning Lab below is a worksheet,
            not an automatic apply path.
          </p>
        </div>
      </div>

      {spdControl}

      <DimmInventory modules={ram.modules ?? []} />

      <RamReadinessPanel readiness={readiness} />

      <ManualTuningLab
        suggestion={manualSuggestion}
        readiness={readiness}
        isVip={isVip}
        kitLabel={kit.brand + ' ' + kit.model}
      />

      {kit.notes && (
        <p className="text-xs text-text-muted italic border-l-2 border-accent pl-3">
          {kit.notes}
        </p>
      )}

      <p className="text-xs text-text-subtle">
        These are read-only kit/profile references. optimizationmaxxing refuses to write DRAM
        training, timings, or voltage in software. If you manually choose the manufacturer-rated
        profile or an experimental worksheet in BIOS, save a recovery profile first and run a
        stability test below.
      </p>

      <StabilityLauncher />
    </div>
  )
}

function ManualTuningLab({
  suggestion,
  readiness,
  isVip,
  kitLabel,
}: {
  suggestion: SecondarySuggestion
  readiness: ReturnType<typeof assessRamTuningReadiness>
  isVip: boolean
  kitLabel: string
}) {
  const [armed, setArmed] = useState(false)
  const [showVoltages, setShowVoltages] = useState(true)

  return (
    <section className="rounded-lg border border-amber-500/45 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-amber-300 font-semibold">
            VIP · manual tuning lab · BIOS only
          </p>
          <h3 className="text-base font-semibold mt-1">Extreme memory worksheet</h3>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            This restores the advanced timing and voltage material as an explicit manual lane. It
            never becomes a Tune Now action, never writes SPD/BIOS, and never claims that a value is
            stable until your exact rig proves it.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-widest border border-amber-500/40 rounded px-2 py-1 text-amber-200">
          {suggestion.ddr} · {suggestion.speedMts || 'unknown'} MT/s
        </span>
      </div>

      {!isVip ? (
        <div className="rounded border border-border bg-bg-raised/50 p-3 text-xs text-text-muted leading-relaxed">
          <strong className="text-text">VIP unlock.</strong> The manual timing and voltage
          worksheet is intentionally gated. The free path still shows the detected baseline and
          validation workflow. <Link to="/pricing" className="underline text-accent">View VIP</Link>.
        </div>
      ) : !armed ? (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-xs text-text-muted leading-relaxed">
            <input type="checkbox" checked={armed} onChange={(e) => setArmed(e.target.checked)} className="mt-0.5" />
            <span>
              I have a known-good BIOS profile, a CMOS/recovery path, and understand that this is a
              manual experiment for <strong className="text-text">{kitLabel}</strong>. One bad value
              can cause a training loop, corruption, crash, or lost game session.
            </span>
          </label>
          <p className="text-[11px] text-amber-200/80">Check the acknowledgement to reveal the worksheet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded border border-border bg-bg-raised/40 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-text-subtle">timing targets</p>
              {suggestion.known && readiness.numericWorksheetEligible ? (
                <>
                  <p className="text-text-muted">Die match: <strong className="text-text">{suggestion.dieLabel}</strong></p>
                  <p className="text-text-muted">tRFC starting point: <strong className="text-accent">{suggestion.trfc?.clocks} clocks</strong> ({suggestion.trfc?.ns} ns)</p>
                  <p className="text-[11px] text-text-subtle">Tighten only toward: {suggestion.trfc?.tightenToward}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <tbody>
                        {suggestion.rows.map((row) => (
                          <tr key={row.timing} className="border-t border-border/70">
                            <td className="py-1.5 pr-3 text-text-muted">{row.timing}</td>
                            <td className="py-1.5 pr-3 font-mono text-text">{row.value}</td>
                            <td className="py-1.5 text-text-subtle">{row.note ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-amber-200/90 leading-relaxed">
                  {readiness.numericWorksheetEligible
                    ? 'Die is not confirmed, so numeric timing targets stay hidden. Confirm the exact module/IC first; guessing tRFC is not an extreme-performance strategy.'
                    : `${readiness.title}. Numeric timing targets stay hidden until the kit, board, BIOS, DIMM layout, and SPD signal support a meaningful experiment.`}
                </p>
              )}
            </div>

            <div className="rounded border border-border bg-bg-raised/40 p-3 space-y-2">
              <button
                type="button"
                onClick={() => setShowVoltages((v) => !v)}
                className="w-full flex items-center justify-between text-left"
              >
                <span className="text-[10px] uppercase tracking-widest text-text-subtle">voltage recipe worksheet</span>
                <span className="text-[11px] text-accent">{showVoltages ? 'hide' : 'show'}</span>
              </button>
              {showVoltages && (
                <div className="space-y-2">
                  {suggestion.voltageRows.map((row) => (
                    <div key={row.rail} className="border-t border-border/70 pt-2">
                      <p className="text-text font-semibold">{row.rail}</p>
                      <p className="text-[11px] text-text-muted">Baseline: {row.baseline}</p>
                      <p className="text-[11px] text-text-subtle">Manual experiment: {row.experiment}</p>
                      <p className="text-[11px] text-amber-200/80">Stop: {row.stop}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded border border-border/80 bg-bg-raised/30 p-3 text-[11px] text-text-muted leading-relaxed space-y-1">
            <p><strong className="text-text">Platform note:</strong> {suggestion.platformNote}</p>
            {suggestion.caveats.slice(0, 3).map((caveat) => <p key={caveat}>• {caveat}</p>)}
            <a href={suggestion.guide.url} target="_blank" rel="noreferrer" className="inline-block underline text-accent mt-1">
              {suggestion.guide.label} ↗
            </a>
          </div>

          <button type="button" onClick={() => setArmed(false)} className="text-[11px] text-text-subtle underline hover:text-text">
            Hide manual worksheet
          </button>
        </>
      )}
    </section>
  )
}

function RamReadinessPanel({
  readiness,
}: {
  readiness: ReturnType<typeof assessRamTuningReadiness>
}) {
  const tone = readiness.level === 'manual-ready'
    ? 'border-emerald-500/40 bg-emerald-500/5'
    : readiness.level === 'profile-first'
    ? 'border-accent/60 bg-accent/5'
    : 'border-border bg-bg-raised/30'

  return (
    <section className={`rounded-lg border p-4 space-y-3 ${tone}`}>
      <div>
        <p className="text-[10px] uppercase tracking-[0.24em] text-text-subtle font-semibold">
          hardware-aware diagnosis
        </p>
        <h3 className="text-base font-semibold mt-1">{readiness.title}</h3>
        <p className="text-xs text-text-muted leading-relaxed mt-1">{readiness.summary}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="rounded border border-border/70 bg-bg-raised/30 p-2.5">
            <p className={`text-xs font-semibold ${
              check.status === 'pass' ? 'text-emerald-300' :
              check.status === 'warn' ? 'text-amber-200' : 'text-red-300'
            }`}>
              {check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '×'} {check.label}
            </p>
            <p className="text-[11px] text-text-subtle leading-snug mt-1">{check.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded border border-border/80 bg-bg-raised/30 p-3 text-[11px] text-text-muted leading-relaxed space-y-1">
        <p><strong className="text-text">Next:</strong> {readiness.nextAction}</p>
        {readiness.notes.map((note) => <p key={note}>• {note}</p>)}
      </div>
    </section>
  )
}

function DimmInventory({ modules }: { modules: RamModuleInfo[] }) {
  if (!modules.length) return null
  return (
    <section className="rounded-lg border border-border bg-bg-raised/30 p-4 space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-[0.24em] text-text-subtle font-semibold">
          installed DIMM inventory
        </p>
        <p className="text-[11px] text-text-subtle leading-snug mt-1">
          WMI inventory only: useful for spotting mixed kits and layouts, but it cannot prove the
          DRAM die, rank, memory-controller headroom, or stability.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-border/70 text-text-subtle">
              <th className="py-1.5 pr-3 font-medium">Slot</th>
              <th className="py-1.5 pr-3 font-medium">Part number</th>
              <th className="py-1.5 pr-3 font-medium">Capacity</th>
              <th className="py-1.5 pr-3 font-medium">Configured</th>
              <th className="py-1.5 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((module, index) => (
              <tr key={`${module.slot}-${module.partNumber ?? index}`} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-3 text-text-muted">{module.slot}</td>
                <td className="py-1.5 pr-3 font-mono text-text">{module.partNumber || 'unknown'}</td>
                <td className="py-1.5 pr-3 text-text-muted">{module.capacityGb || '—'} GB</td>
                <td className="py-1.5 pr-3 text-text-muted">{module.configuredSpeedMts ? `${module.configuredSpeedMts} MT/s` : '—'}</td>
                <td className="py-1.5 text-text-muted">{module.memoryType || module.formFactor || 'unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SpdDieControl({
  isNative,
  busy,
  msg,
  dies,
  onRead,
}: {
  isNative: boolean
  busy: boolean
  msg: string | null
  dies: DieResult[]
  onRead: () => void
}) {
  if (!isNative) return null
  return (
    <div className="rounded-md border border-border bg-bg-raised/40 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text">SPD vendor/profile signal</p>
          <p className="text-[11px] text-text-subtle leading-snug">
            Reads SPD manufacturer fields. SPD often cannot prove the exact die or a stable timing profile. One UAC.
          </p>
        </div>
        <button
          onClick={onRead}
          disabled={busy}
          className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40 shrink-0"
        >
          {busy ? 'Reading SPD…' : dies.length ? 'Re-read SPD' : 'Read SPD info (UAC)'}
        </button>
      </div>
      {dies.length > 0 && (
        <div className="space-y-1">
          {dies.map((die, index) => (
            <p key={`${die.vendor}-${index}`} className="text-xs text-text-muted">
              DIMM {index + 1}: <span className="text-accent font-semibold">{die.vendor}</span>
              {die.die ? ` → ${die.die}` : ' (die not determinable from SPD alone)'}
            </p>
          ))}
        </div>
      )}
      {msg && <p className="text-[11px] text-text-subtle leading-snug">{msg}</p>}
    </div>
  )
}

function KitStat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub: string
  highlight?: 'good' | 'warn'
}) {
  return (
    <div className="border border-border rounded-md p-3">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p
        className={`text-base font-semibold tabular-nums ${
          highlight === 'warn'
            ? 'text-accent'
            : highlight === 'good'
            ? 'text-text'
            : 'text-text'
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-text-muted">{sub}</p>
    </div>
  )
}

function StabilityLauncher() {
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-text-subtle">
        stability tests
      </p>
      <p className="text-xs text-text-muted leading-relaxed">
        Verify your BIOS changes don't crash under sustained load. Run before claiming a profile is
        stable.
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <a
          href="javascript:void(0)"
          onClick={(e) => {
            e.preventDefault()
            alert(
              'Phase 4d will wire mdsched.exe via the elevation module. For now: Win+R, type "mdsched.exe", press Enter.',
            )
          }}
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text"
        >
          Windows MemTest (mdsched.exe)
        </a>
        <a
          href="https://www.karhusoftware.com/ramtest/"
          target="_blank"
          rel="noopener"
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
        >
          Karhu RamTest ($10) ↗
        </a>
        <a
          href="https://github.com/CoolCmd/TestMem5"
          target="_blank"
          rel="noopener"
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
        >
          TestMem5 (free) ↗
        </a>
        <a
          href="https://www.guru3d.com/download/y-cruncher-download/"
          target="_blank"
          rel="noopener"
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
        >
          y-cruncher ↗
        </a>
      </div>
    </div>
  )
}
