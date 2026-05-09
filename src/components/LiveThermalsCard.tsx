import { useEffect, useRef, useState } from 'react'
import {
  inTauri,
  liveThermals,
  lhmSensors,
  lhmSensorsElevated,
  type LhmComponent,
  type LhmReport,
  type LhmSensorReading,
  type LiveThermalsReport,
} from '../lib/tauri'

/**
 * Live thermal + throttle monitor backed by LibreHardwareMonitor.
 *
 * Two-layer probe:
 *   1. Unelevated LHM probe — runs every 2 s, gets ACPI thermal zones,
 *      GPU sensors via vendor APIs (NVAPI / ADL through LHM), motherboard
 *      sensors, NVMe SMART. Most rigs already get CPU / GPU temps at this
 *      tier without admin.
 *   2. "Enable full sensor access" button — fires the elevated probe (one
 *      UAC) which loads the WinRing0 kernel driver. Unlocks CPU package
 *      + per-core temps + voltage rails. Persists in localStorage so the
 *      next launch attempts elevated automatically.
 *
 * Falls back to the simple WMI/nvidia-smi probe (LiveThermalsReport) if
 * the LHM bundle fails entirely (e.g. AV blocked the DLL load). That
 * keeps the card useful on locked-down machines.
 */

const ELEVATE_PREF_KEY = 'optmaxxing-lhm-prefer-elevated'

interface State {
  lhm: LhmReport | null
  fallback: LiveThermalsReport | null
  elevatedRequested: boolean
  loading: boolean
  error: string | null
}

export function LiveThermalsCard() {
  const isNative = inTauri()
  const [state, setState] = useState<State>({
    lhm: null,
    fallback: null,
    elevatedRequested: false,
    loading: true,
    error: null,
  })
  const [preferElevated, setPreferElevated] = useState<boolean>(() =>
    localStorage.getItem(ELEVATE_PREF_KEY) === '1',
  )
  const timer = useRef<number | null>(null)

  useEffect(() => {
    localStorage.setItem(ELEVATE_PREF_KEY, preferElevated ? '1' : '0')
  }, [preferElevated])

  useEffect(() => {
    if (!isNative) return
    let cancelled = false
    async function tick() {
      try {
        const lhm = await lhmSensors()
        if (cancelled) return
        if (lhm.ok) {
          setState((s) => ({
            ...s,
            lhm,
            fallback: null,
            loading: false,
            error: null,
          }))
        } else {
          // LHM failed — pull the no-bundle fallback instead.
          const fb = await liveThermals().catch(() => null)
          if (cancelled) return
          setState((s) => ({
            ...s,
            lhm,
            fallback: fb,
            loading: false,
            error: lhm.error,
          }))
        }
      } catch (e) {
        if (cancelled) return
        const fb = await liveThermals().catch(() => null)
        if (cancelled) return
        setState((s) => ({
          ...s,
          lhm: null,
          fallback: fb,
          loading: false,
          error: typeof e === 'string' ? e : (e as Error).message ?? String(e),
        }))
      }
    }
    tick()
    timer.current = window.setInterval(tick, 2500)
    return () => {
      cancelled = true
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [isNative])

  async function elevateNow() {
    setState((s) => ({ ...s, elevatedRequested: true, loading: true, error: null }))
    try {
      const r = await lhmSensorsElevated()
      setState((s) => ({
        ...s,
        lhm: r,
        loading: false,
        error: r.ok ? null : r.error,
      }))
      if (r.ok) setPreferElevated(true)
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: typeof e === 'string' ? e : (e as Error).message ?? String(e),
      }))
    }
  }

  const lhm = state.lhm
  const fallback = state.fallback
  const usingLhm = lhm?.ok === true
  const cpu = usingLhm ? lhm.components.find((c) => c.kind === 'cpu') : null
  const gpus = usingLhm ? lhm.components.filter((c) => c.kind.startsWith('gpu_')) : []
  const motherboard = usingLhm ? lhm.components.find((c) => c.kind === 'motherboard') : null
  const storage = usingLhm ? lhm.components.filter((c) => c.kind === 'storage') : []
  const memory = usingLhm ? lhm.components.find((c) => c.kind === 'memory') : null

  const cpuPkg = cpu ? findSensor(cpu, 'temperature', /package|tctl|tdie/i) : null
  const cpuCoreTemps = cpu ? cpu.sensors.filter((s) => s.kind === 'temperature' && /core[ #]?\d/i.test(s.name)) : []
  const cpuClocks = cpu ? cpu.sensors.filter((s) => s.kind === 'clock' && /core[ #]?\d/i.test(s.name)) : []
  const cpuLoad = cpu ? findSensor(cpu, 'load', /total|cpu total/i) : null
  const cpuPower = cpu ? findSensor(cpu, 'power', /package|cpu/i) : null

  const throttleSuspected =
    !!cpuPkg?.value && cpuPkg.value >= 90 ||
    !!cpu?.sensors.some((s) => s.kind === 'temperature' && (s.value ?? 0) >= 95) ||
    !!gpus.some((g) =>
      g.sensors.some((s) => s.kind === 'temperature' && (s.value ?? 0) >= 88),
    )

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">
            sensors · live
            {lhm?.elevated && <span className="text-emerald-400 ml-2">● elevated</span>}
            {usingLhm && !lhm.elevated && <span className="text-amber-300 ml-2">● user-mode</span>}
            {!usingLhm && fallback && <span className="text-text-subtle ml-2">● fallback (no LHM)</span>}
          </p>
          <h2 className="text-lg font-semibold">Live thermals + throttle watch</h2>
          <p className="text-sm text-text-muted max-w-2xl">
            Backed by LibreHardwareMonitor. Refreshes every 2.5 s. Flags red banners when a
            CPU/GPU temp is in the throttle band.
            {!lhm?.elevated && (
              <span className="block mt-1 text-text-subtle text-xs">
                CPU package + voltage rails require admin (one UAC, one click).
              </span>
            )}
          </p>
        </div>
        {!lhm?.elevated && isNative && (
          <button
            onClick={elevateNow}
            disabled={state.loading}
            className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
          >
            {state.elevatedRequested && state.loading
              ? 'Probing…'
              : 'Enable full sensor access (UAC)'}
          </button>
        )}
      </div>

      {!isNative && (
        <p className="text-xs text-text-subtle italic">
          Requires the optimizationmaxxing.exe shell — open the desktop app.
        </p>
      )}

      {state.error && !usingLhm && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug space-y-1">
          <div>
            <strong>LibreHardwareMonitor probe failed:</strong> {state.error}
          </div>
          <div>
            Most common cause is Windows Defender or your AV blocking the WinRing0 kernel driver.
            See <a className="underline hover:text-text" href="/guides?game=any">/guides → "WinRing0 / LHM antivirus exclusion"</a> for the fix.
            We're showing fallback sensors below in the meantime.
          </div>
        </div>
      )}

      {throttleSuspected && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-300 leading-snug">
          <strong>Thermal throttling territory.</strong> One or more components are running at or
          past their throttle threshold — check airflow + paste age before you trust framerate
          numbers.
        </div>
      )}

      {usingLhm ? (
        <div className="space-y-3">
          {/* CPU */}
          {cpu && (
            <Tile
              eyebrow={`cpu · ${cpu.name}`}
              kpi={cpuPkg ? <KpiValue value={cpuPkg.value} unit="°C" colorClass={tempColor(cpuPkg.value)} /> : null}
              kpiLabel={cpuPkg ? 'Package' : 'No package temp — try Enable full sensor access'}
            >
              {cpuLoad?.value != null && (
                <Mini label="Load" value={`${cpuLoad.value.toFixed(0)}%`} />
              )}
              {cpuPower?.value != null && (
                <Mini label="Power" value={`${cpuPower.value.toFixed(0)} W`} />
              )}
              {cpuCoreTemps.length > 0 && (
                <Mini
                  label={`${cpuCoreTemps.length} cores avg`}
                  value={`${avg(cpuCoreTemps).toFixed(0)} °C`}
                />
              )}
              {cpuClocks.length > 0 && (
                <Mini
                  label={`${cpuClocks.length} cores avg`}
                  value={`${(avg(cpuClocks) / 1000).toFixed(2)} GHz`}
                />
              )}
              {cpuCoreTemps.length > 0 && (
                <details className="col-span-full text-[11px] text-text-subtle pt-2 border-t border-border">
                  <summary className="cursor-pointer">per-core breakdown</summary>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mt-2">
                    {cpuCoreTemps.map((s) => (
                      <div key={s.name} className="flex justify-between gap-2">
                        <span className="text-text-muted truncate">{s.name}</span>
                        <span className={`tabular-nums font-semibold ${tempColor(s.value)}`}>
                          {s.value?.toFixed(0) ?? '—'} °C
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </Tile>
          )}

          {/* GPUs */}
          {gpus.map((g) => {
            const temp = findSensor(g, 'temperature', /core|gpu/i)
            const load = findSensor(g, 'load', /core|gpu/i)
            const power = findSensor(g, 'power', /power|gpu/i)
            const fan = findSensor(g, 'fan', /fan/i)
            const fanCtl = findSensor(g, 'control', /fan/i)
            const clock = findSensor(g, 'clock', /core/i)
            const memClock = findSensor(g, 'clock', /memory/i)
            return (
              <Tile
                key={g.name}
                eyebrow={`gpu · ${labelForGpuKind(g.kind)} · ${g.name}`}
                kpi={temp ? <KpiValue value={temp.value} unit="°C" colorClass={tempColor(temp.value)} /> : null}
                kpiLabel="Core temp"
              >
                {load?.value != null && <Mini label="Load" value={`${load.value.toFixed(0)}%`} />}
                {power?.value != null && <Mini label="Power" value={`${power.value.toFixed(0)} W`} />}
                {clock?.value != null && (
                  <Mini label="Core clock" value={`${(clock.value / 1).toFixed(0)} MHz`} />
                )}
                {memClock?.value != null && (
                  <Mini label="Mem clock" value={`${memClock.value.toFixed(0)} MHz`} />
                )}
                {fan?.value != null && (
                  <Mini label="Fan" value={`${fan.value.toFixed(0)} RPM`} />
                )}
                {fanCtl?.value != null && (
                  <Mini label="Fan duty" value={`${fanCtl.value.toFixed(0)}%`} />
                )}
              </Tile>
            )
          })}

          {/* Motherboard */}
          {motherboard && motherboard.sensors.length > 0 && (
            <Tile eyebrow={`motherboard · ${motherboard.name}`}>
              <SensorList sensors={topSensors(motherboard, 8)} />
            </Tile>
          )}

          {/* Storage SMART */}
          {storage.length > 0 && (
            <Tile eyebrow="storage · NVMe / SATA">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 col-span-full">
                {storage.map((s) => {
                  const temp = findSensor(s, 'temperature', /temp/i)
                  const wear = findSensor(s, 'level', /used|wear/i)
                  return (
                    <div key={s.name} className="text-xs">
                      <p className="text-text-muted truncate font-mono">{s.name}</p>
                      <div className="flex gap-3 mt-1">
                        {temp?.value != null && (
                          <span className={`tabular-nums font-semibold ${tempColor(temp.value)}`}>
                            {temp.value.toFixed(0)} °C
                          </span>
                        )}
                        {wear?.value != null && (
                          <span className="text-text-subtle">wear {wear.value.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Tile>
          )}

          {/* Memory */}
          {memory && memory.sensors.length > 0 && (
            <Tile eyebrow={`memory · ${memory.name}`}>
              <SensorList sensors={topSensors(memory, 4)} />
            </Tile>
          )}
        </div>
      ) : fallback ? (
        // Fallback rendering when LHM bundle didn't load — show the simple
        // WMI/nvidia-smi data so the card still has signal.
        <FallbackThermals fallback={fallback} />
      ) : (
        <p className="text-xs text-text-subtle italic">probing sensors…</p>
      )}

      <p className="text-[11px] text-text-subtle pt-2 border-t border-border leading-snug">
        Sensor data via{' '}
        <a className="underline hover:text-text" href="https://github.com/LibreHardwareMonitor/LibreHardwareMonitor" target="_blank" rel="noreferrer">
          LibreHardwareMonitor
        </a>{' '}
        (MIT, bundled v0.9.6). Some sensors require admin via the WinRing0 kernel driver — if your
        AV blocks it, see <a className="underline hover:text-text" href="/guides">/guides → AV exclusion</a>.
      </p>
    </section>
  )
}

function FallbackThermals({ fallback }: { fallback: LiveThermalsReport }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-text-subtle italic">
        Showing simple WMI + nvidia-smi readings (no LHM). CPU package temp / per-core / voltages
        unavailable in this mode.
      </p>
      {fallback.thermalZones.length > 0 && (
        <Tile eyebrow="acpi thermal zones (motherboard)">
          <SensorList
            sensors={fallback.thermalZones.map((z) => ({
              name: z.source,
              kind: 'temperature',
              value: z.celsius,
              min: null,
              max: null,
            }))}
          />
        </Tile>
      )}
      {fallback.gpus.map((g) => (
        <Tile key={g.name} eyebrow={`gpu · ${g.vendor} · ${g.name}`}>
          {g.temperatureC != null && <Mini label="Temp" value={`${g.temperatureC.toFixed(0)} °C`} />}
          {g.utilizationPct != null && <Mini label="Load" value={`${g.utilizationPct}%`} />}
          {g.powerW != null && <Mini label="Power" value={`${g.powerW.toFixed(0)} W`} />}
          {g.clockMhz != null && <Mini label="Clock" value={`${g.clockMhz} MHz`} />}
          {g.fanPct != null && <Mini label="Fan" value={`${g.fanPct}%`} />}
        </Tile>
      ))}
      {fallback.cpuClock.currentMhz != null && (
        <Tile eyebrow="cpu · clock (no temp without admin)">
          <Mini label="Live MHz" value={`${fallback.cpuClock.currentMhz}`} />
          <Mini label="% of max" value={`${fallback.cpuClock.currentPctOfMax?.toFixed(0)}%`} />
          <Mini label="Base MHz" value={`${fallback.cpuClock.baseMhz}`} />
        </Tile>
      )}
    </div>
  )
}

function Tile({
  eyebrow,
  kpi,
  kpiLabel,
  children,
}: {
  eyebrow: string
  kpi?: React.ReactNode
  kpiLabel?: string
  children?: React.ReactNode
}) {
  return (
    <div className="surface-card p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{eyebrow}</p>
      {kpi && (
        <div className="flex items-baseline gap-3">
          {kpi}
          {kpiLabel && <span className="text-[11px] text-text-subtle">{kpiLabel}</span>}
        </div>
      )}
      {children && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">{children}</div>
      )}
    </div>
  )
}

function KpiValue({
  value,
  unit,
  colorClass,
}: {
  value: number | null
  unit: string
  colorClass: string
}) {
  return (
    <span className={`text-3xl font-bold tabular-nums ${colorClass}`}>
      {value == null ? '—' : value.toFixed(0)}
      <span className="text-base text-text-muted font-normal ml-1">{unit}</span>
    </span>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function SensorList({ sensors }: { sensors: LhmSensorReading[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 col-span-full text-xs">
      {sensors.map((s) => (
        <div key={s.name} className="flex justify-between gap-2">
          <span className="text-text-muted truncate">{s.name}</span>
          <span
            className={`tabular-nums font-semibold ${
              s.kind === 'temperature' ? tempColor(s.value) : 'text-text'
            }`}
          >
            {formatSensor(s)}
          </span>
        </div>
      ))}
    </div>
  )
}

function findSensor(c: LhmComponent, kind: string, namePattern: RegExp): LhmSensorReading | null {
  return c.sensors.find((s) => s.kind === kind && namePattern.test(s.name)) ?? null
}

function topSensors(c: LhmComponent, n: number): LhmSensorReading[] {
  // Prefer temperature, fan, voltage in that order.
  const order = ['temperature', 'fan', 'voltage', 'load', 'control']
  return [...c.sensors]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .slice(0, n)
}

function avg(rows: LhmSensorReading[]): number {
  const vals = rows.map((r) => r.value).filter((v): v is number => v != null)
  if (vals.length === 0) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function formatSensor(s: LhmSensorReading): string {
  if (s.value == null) return '—'
  switch (s.kind) {
    case 'temperature':
      return `${s.value.toFixed(0)} °C`
    case 'fan':
      return `${s.value.toFixed(0)} RPM`
    case 'voltage':
      return `${s.value.toFixed(2)} V`
    case 'load':
    case 'control':
    case 'level':
      return `${s.value.toFixed(0)}%`
    case 'clock':
    case 'frequency':
      return `${s.value.toFixed(0)} MHz`
    case 'power':
      return `${s.value.toFixed(0)} W`
    case 'data':
    case 'data_small':
      return `${s.value.toFixed(1)} GB`
    case 'throughput':
      return `${(s.value / 1024 / 1024).toFixed(1)} MB/s`
    default:
      return s.value.toFixed(2)
  }
}

function labelForGpuKind(kind: string): string {
  switch (kind) {
    case 'gpu_nvidia':
      return 'NVIDIA'
    case 'gpu_amd':
      return 'AMD'
    case 'gpu_intel':
      return 'Intel'
    default:
      return kind
  }
}

function tempColor(c: number | null | undefined): string {
  if (c == null) return 'text-text-muted'
  if (c >= 90) return 'text-red-400'
  if (c >= 80) return 'text-amber-300'
  if (c >= 65) return 'text-emerald-300'
  return 'text-emerald-400'
}
