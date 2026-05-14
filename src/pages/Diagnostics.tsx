import { useEffect, useState } from 'react'
import { BiosAuditCard } from '../components/BiosAuditCard'
import { DpcLatencyCard } from '../components/DpcLatencyCard'
import { DriverHealthCard } from '../components/DriverHealthCard'
import { HudFrame } from '../components/HudFrame'
import { IntelMicrocodeCard } from '../components/IntelMicrocodeCard'
import { LastCrashCard } from '../components/LastCrashCard'
import { MonitorFirmwareCard } from '../components/MonitorFirmwareCard'
import { NetworkAuditCard } from '../components/NetworkAuditCard'
import { PcieLinkCard } from '../components/PcieLinkCard'
import { RamAdvisorCard } from '../components/RamAdvisorCard'
import { UclkWarningCard } from '../components/UclkWarningCard'
import { VbsStatusCard } from '../components/VbsStatusCard'
import {
  detectSpecs,
  diskFree,
  inTauri,
  readTemps,
  systemMetrics,
  type DiskFreeRow,
  type PerfSnapshot,
  type SpecProfile,
  type ThermalSnapshot,
} from '../lib/tauri'

interface Snapshot {
  spec: SpecProfile | null
  perf: PerfSnapshot | null
  temps: ThermalSnapshot | null
  disks: DiskFreeRow[] | null
  capturedAt: string
}

export function Diagnostics() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const isNative = inTauri()

  async function refreshAll() {
    if (!isNative) {
      setErr('Diagnostics requires the optimizationmaxxing.exe shell — open the desktop app.')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const [spec, perf, temps, disks] = await Promise.all([
        detectSpecs(false).catch(() => null),
        systemMetrics().catch(() => null),
        readTemps().catch(() => null),
        diskFree().catch(() => null),
      ])
      setSnap({ spec, perf, temps, disks, capturedAt: new Date().toISOString() })
    } catch (e) {
      setErr(formatErr(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copySnapshot() {
    if (!snap) return
    try {
      await navigator.clipboard.writeText(formatSnapshot(snap))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">snapshot</p>
          <h1 className="text-2xl font-bold">Diagnostics</h1>
          <p className="text-sm text-text-muted max-w-2xl">
            One-shot rollup of your rig + live metrics + temps + disk space. Copy the whole thing
            to clipboard when asking for help on Discord — saves the back-and-forth.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            disabled={loading || !isNative}
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={copySnapshot}
            disabled={!snap}
            className="px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
          >
            {copied ? 'Copied ✓' : 'Copy snapshot'}
          </button>
        </div>
      </header>

      {err && (
        <div className="surface-card p-4 text-sm text-text-muted italic">{err}</div>
      )}

      {snap && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricCard
              label="CPU"
              big={snap.perf ? `${snap.perf.cpuPercent.toFixed(0)}%` : '—'}
              sub={snap.spec?.cpu?.marketing || snap.spec?.cpu?.model}
            />
            <MetricCard
              label="RAM"
              big={snap.perf ? `${snap.perf.ramPercent.toFixed(0)}%` : '—'}
              sub={
                snap.perf
                  ? `${snap.perf.ramUsedGb.toFixed(1)} / ${snap.perf.ramTotalGb.toFixed(1)} GB`
                  : null
              }
            />
            <MetricCard
              label="Uptime"
              big={snap.perf ? formatUptime(snap.perf.uptimeSecs) : '—'}
              sub={snap.spec?.os?.caption}
            />
          </section>

          <section className="surface-card p-5 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-text-subtle">rig</p>
              <h2 className="text-lg font-semibold">Hardware + OS</h2>
            </div>
            {snap.spec ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="CPU" value={snap.spec.cpu.marketing || snap.spec.cpu.model} />
                <Row
                  label="Cores"
                  value={`${snap.spec.cpu.cores}p / ${snap.spec.cpu.logicalCores}t`}
                />
                <Row
                  label="GPU"
                  value={`${snap.spec.gpu.model || '—'}${
                    snap.spec.gpu.vramMb ? ` · ${(snap.spec.gpu.vramMb / 1024).toFixed(1)} GB` : ''
                  }`}
                />
                <Row label="GPU driver" value={snap.spec.gpu.driverVersion} />
                <Row
                  label="RAM"
                  value={`${snap.spec.ram.totalGb} GB · ${snap.spec.ram.stickCount} sticks${
                    snap.spec.ram.configuredSpeedMts
                      ? ` @ ${snap.spec.ram.configuredSpeedMts} MT/s`
                      : ''
                  }`}
                />
                <Row label="RAM kit" value={snap.spec.ram.partNumber} />
                <Row
                  label="OS"
                  value={`${snap.spec.os.caption} · build ${snap.spec.os.build}${
                    snap.spec.os.ubr ? `.${snap.spec.os.ubr}` : ''
                  }`}
                />
                <Row label="Display version" value={snap.spec.os.displayVersion} />
                <Row
                  label="Motherboard"
                  value={
                    snap.spec.mobo.manufacturer && snap.spec.mobo.product
                      ? `${snap.spec.mobo.manufacturer} ${snap.spec.mobo.product}`
                      : null
                  }
                />
                <Row label="BIOS" value={snap.spec.mobo.biosVersion} />
              </div>
            ) : (
              <p className="text-sm text-text-muted italic">Spec detection unavailable.</p>
            )}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Temps */}
            <div className="surface-card p-5 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-text-subtle">temps</p>
                <h2 className="text-lg font-semibold">Thermal probes</h2>
              </div>
              {snap.temps && snap.temps.probes.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {snap.temps.probes.map((p, i) => (
                    <div key={i} className="border border-border rounded-md p-3 text-center">
                      <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                        {p.source}
                      </p>
                      <p
                        className={`text-2xl font-bold tabular-nums ${
                          p.celsius > 80 ? 'text-accent' : 'text-text'
                        }`}
                      >
                        {p.celsius.toFixed(1)}°
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted italic">
                  ACPI didn't return any thermal zones on this rig.
                </p>
              )}
              {snap.temps && (
                <p className="text-[11px] text-text-subtle italic">{snap.temps.disclaimer}</p>
              )}
            </div>

            {/* Disks */}
            <div className="surface-card p-5 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-text-subtle">storage</p>
                <h2 className="text-lg font-semibold">Disk free space</h2>
              </div>
              {snap.disks && snap.disks.length > 0 ? (
                <div className="space-y-2">
                  {snap.disks.map((d) => (
                    <div key={d.driveLetter} className="text-sm">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-text">
                          <span className="font-semibold">{d.driveLetter}</span>
                          {d.label ? (
                            <span className="text-text-muted"> · {d.label}</span>
                          ) : null}
                        </span>
                        <span
                          className={`text-xs tabular-nums ${
                            d.freePercent < 10 ? 'text-accent' : 'text-text-muted'
                          }`}
                        >
                          {d.freeGb} / {d.sizeGb} GB free
                        </span>
                      </div>
                      <div className="h-1.5 bg-border rounded overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${100 - d.freePercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted italic">No fixed drives reported.</p>
              )}
            </div>
          </section>

          <HudFrame><IntelMicrocodeCard /></HudFrame>

          <HudFrame><DriverHealthCard /></HudFrame>

          <HudFrame><BiosAuditCard /></HudFrame>

          <HudFrame><NetworkAuditCard /></HudFrame>

          <HudFrame><MonitorFirmwareCard /></HudFrame>

          <HudFrame><VbsStatusCard /></HudFrame>

          <UclkWarningCard spec={snap.spec} />

          <HudFrame><RamAdvisorCard /></HudFrame>

          <PcieLinkCard />

          <HudFrame><DpcLatencyCard /></HudFrame>

          <LastCrashCard />

          <p className="text-[11px] text-text-subtle text-center">
            Captured {new Date(snap.capturedAt).toLocaleTimeString()} ·{' '}
            {new Date(snap.capturedAt).toLocaleDateString()}
          </p>
        </>
      )}
    </div>
  )
}

function MetricCard({
  label,
  big,
  sub,
}: {
  label: string
  big: string
  sub?: string | null
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="text-3xl font-bold text-accent tabular-nums leading-tight">{big}</p>
      {sub ? <p className="text-xs text-text-muted truncate">{sub}</p> : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border/50 py-1">
      <span className="text-[11px] uppercase tracking-widest text-text-subtle min-w-24">
        {label}
      </span>
      <span className="text-text break-all">{value || '—'}</span>
    </div>
  )
}

function formatUptime(secs: number): string {
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatSnapshot(s: Snapshot): string {
  const lines: string[] = []
  lines.push(`# optimizationmaxxing diagnostics — ${s.capturedAt}`)
  lines.push('')
  if (s.spec) {
    lines.push('## Hardware')
    lines.push(`CPU: ${s.spec.cpu.marketing || s.spec.cpu.model} (${s.spec.cpu.cores}p/${s.spec.cpu.logicalCores}t)`)
    lines.push(`GPU: ${s.spec.gpu.model || '—'}${s.spec.gpu.driverVersion ? ` (driver ${s.spec.gpu.driverVersion})` : ''}`)
    lines.push(`RAM: ${s.spec.ram.totalGb} GB · ${s.spec.ram.stickCount} sticks${s.spec.ram.configuredSpeedMts ? ` @ ${s.spec.ram.configuredSpeedMts} MT/s` : ''}${s.spec.ram.partNumber ? ` · ${s.spec.ram.partNumber}` : ''}`)
    lines.push(`OS: ${s.spec.os.caption} · build ${s.spec.os.build}${s.spec.os.ubr ? `.${s.spec.os.ubr}` : ''}`)
    if (s.spec.mobo.manufacturer && s.spec.mobo.product) {
      lines.push(`Mobo: ${s.spec.mobo.manufacturer} ${s.spec.mobo.product}${s.spec.mobo.biosVersion ? ` · BIOS ${s.spec.mobo.biosVersion}` : ''}`)
    }
    lines.push('')
  }
  if (s.perf) {
    lines.push('## Live metrics')
    lines.push(`CPU: ${s.perf.cpuPercent.toFixed(1)}%`)
    lines.push(`RAM: ${s.perf.ramPercent.toFixed(1)}% (${s.perf.ramUsedGb.toFixed(1)} / ${s.perf.ramTotalGb.toFixed(1)} GB)`)
    lines.push(`Uptime: ${formatUptime(s.perf.uptimeSecs)}`)
    lines.push('')
  }
  if (s.temps && s.temps.probes.length > 0) {
    lines.push('## Temps')
    for (const p of s.temps.probes) {
      lines.push(`${p.source}: ${p.celsius.toFixed(1)}°C`)
    }
    lines.push('')
  }
  if (s.disks && s.disks.length > 0) {
    lines.push('## Disk free')
    for (const d of s.disks) {
      lines.push(`${d.driveLetter} ${d.label ? `(${d.label}) ` : ''}: ${d.freeGb} / ${d.sizeGb} GB free (${d.freePercent.toFixed(0)}%)`)
    }
  }
  return lines.join('\n')
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
