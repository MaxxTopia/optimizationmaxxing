import { useEffect, useState } from 'react'
import { inTauri, ramModules, type RamModule } from '../lib/tauri'

/**
 * RAM Advisor — read-only inspector. Reads Win32_PhysicalMemory + tags
 * each stick with its inferred IC die type + tuning character. Linked to
 * the right tools (Thaiphoon Burner / DRAM Calculator / TestMem5) so
 * users can do the actual BIOS-level tuning themselves.
 *
 * We never auto-flash BIOS. Bad voltage → bricked stick → nuked weekend.
 * This is articleware with detected data.
 */

export function RamAdvisorCard() {
  const isNative = inTauri()
  const [modules, setModules] = useState<RamModule[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isNative) return
    setLoading(true)
    ramModules()
      .then(setModules)
      .catch((e) => setErr(typeof e === 'string' ? e : (e as Error).message ?? String(e)))
      .finally(() => setLoading(false))
  }, [isNative])

  return (
    <section className="surface-card p-5 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-widest text-text-subtle">memory · advisor</p>
        <h2 className="text-lg font-semibold">RAM tightening advisor</h2>
        <p className="text-sm text-text-muted max-w-2xl leading-snug">
          Reads your installed sticks via WMI + identifies the IC die type from the part number.
          Closest thing to a free 5-8% FPS that exists — but only if you tune the right way for
          the right IC. We never auto-flash BIOS; this card surfaces what you have + the tools
          tuners actually trust.
        </p>
      </div>

      {!isNative && (
        <p className="text-xs text-text-subtle italic">
          Requires the optimizationmaxxing.exe shell.
        </p>
      )}

      {err && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {err}
        </div>
      )}

      {loading && <p className="text-xs text-text-subtle italic">probing modules…</p>}

      {modules && modules.length === 0 && (
        <p className="text-xs text-text-muted italic">
          No modules reported by Win32_PhysicalMemory. Some VMs / hyperthread environments
          hide this. Run Thaiphoon Burner directly for SPD detail.
        </p>
      )}

      {modules && modules.length > 0 && (
        <div className="space-y-3">
          {modules.map((m, i) => (
            <ModuleCard key={`${m.slot}-${i}`} module={m} />
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-border space-y-1.5 text-[11px] text-text-subtle leading-snug">
        <p className="uppercase tracking-widest text-text-subtle text-[10px]">tools tuners actually use</p>
        <p>
          <a className="underline hover:text-text" href="https://www.softnology.biz/files.html" target="_blank" rel="noreferrer">
            Thaiphoon Burner
          </a>{' '}
          — verify your IC by dumping SPD directly. Free, no install.
        </p>
        <p>
          <a className="underline hover:text-text" href="https://www.techpowerup.com/download/ryzen-dram-calculator/" target="_blank" rel="noreferrer">
            DRAM Calculator for Ryzen
          </a>{' '}
          — generates SAFE/FAST/EXTREME timings per IC + frequency. AM4 still excellent;
          AM5 (Ryzen 7000/9000) use Buildzoid's manual approach.
        </p>
        <p>
          <a className="underline hover:text-text" href="https://github.com/CoolCmd/TestMem5" target="_blank" rel="noreferrer">
            TestMem5 (anta777 extreme config)
          </a>{' '}
          — stability test for tightened timings. 1-2 hours per profile minimum before you
          trust it for a tournament.
        </p>
        <p>
          <a className="underline hover:text-text" href="https://www.youtube.com/@ActuallyHardcoreOverclocking" target="_blank" rel="noreferrer">
            Buildzoid (Actually Hardcore Overclocking)
          </a>{' '}
          — long-form RAM tuning streams + per-IC manual deep-dives. Watch his Hynix DDR5
          M-die guide if you're on AM5.
        </p>
      </div>
    </section>
  )
}

function ModuleCard({ module: m }: { module: RamModule }) {
  const isUnknown = m.icType === 'unknown'
  return (
    <div
      className="surface-card p-4 space-y-2"
      style={{
        borderColor: isUnknown ? 'rgba(245, 158, 11, 0.4)' : 'rgba(52, 211, 153, 0.32)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">
            {m.slot}  ·  {m.formFactor}
          </p>
          <h3 className="text-base font-semibold truncate">
            {m.manufacturer || 'Unknown'} <span className="font-mono text-sm text-text-muted">{m.partNumber}</span>
          </h3>
        </div>
        <span
          className={`text-[11px] uppercase tracking-widest px-2 py-0.5 rounded font-semibold ${
            isUnknown
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
          }`}
        >
          {m.icType}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
        <Stat label="Capacity" value={`${m.capacityGb} GB`} />
        <Stat label="Speed" value={m.speedMts > 0 ? `${m.speedMts} MT/s` : 'unknown'} />
        <Stat
          label="Voltage"
          value={m.voltageMv != null && m.voltageMv > 0 ? `${(m.voltageMv / 1000).toFixed(2)} V` : 'unreported'}
        />
        <Stat label="Form" value={m.formFactor} />
      </div>
      <p className="text-xs text-text-muted leading-snug">{m.icCharacter}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}
