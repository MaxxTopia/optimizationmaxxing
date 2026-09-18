import { useEffect, useState } from 'react'
import { inTauri, ramModules, type RamModule } from '../lib/tauri'

/**
 * RAM Advisor — read-only inspector. Reads Win32_PhysicalMemory and reports
 * the fields Windows exposes. Part-number/IC hints are intentionally treated
 * as hints, not as permission to apply a timing or voltage recipe.
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
        <h2 className="text-lg font-semibold">RAM stability and profile audit</h2>
        <p className="text-sm text-text-muted max-w-2xl leading-snug">
          Reads your installed sticks via WMI and reports capacity, speed, and available profile
          hints. Memory settings can matter in CPU-bound games, but there is no universal FPS
          number. We never write BIOS timings, voltage, or profiles; if you choose the kit's
          manufacturer-rated XMP/EXPO profile manually, validate it on this CPU and board.
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
          No modules reported by Win32_PhysicalMemory. Some VMs or firmware configurations hide
          this data; use the motherboard/kit vendor's documentation if you need an SPD detail
          that Windows does not expose.
        </p>
      )}

      {modules && modules.length > 0 && (
        <div className="space-y-3">
          {modules.map((m, i) => (
            <ModuleCard key={`${m.slot}-${i}`} module={m} />
          ))}
        </div>
      )}

      {modules && modules.length > 0 && (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
            How the full flow works (left → right)
          </p>
          <ol className="ml-4 list-decimal text-[11px] text-text-muted leading-snug space-y-1.5">
            <li>
              <strong className="text-text">Identify the installed kit</strong> — we report the
              manufacturer, part number, capacity, and speed that Windows exposes. An inferred IC
              label is a hint only; an unknown label is not a reason to guess a manual recipe.
            </li>
            <li>
              <strong className="text-text">Choose a baseline</strong> — keep JEDEC defaults
              while diagnosing instability, or use only the exact manufacturer-rated XMP/EXPO
              profile after checking the board and CPU support list. The{' '}
              <a className="underline text-accent hover:text-text" href="#/guides?game=any#ram-bios-recipes">/guides → RAM stability audit</a>{' '}
              explains the evidence to retain; it contains no copy-paste voltage recipe.
            </li>
            <li>
              <strong className="text-text">If you change the profile manually</strong> — save the
              board's known-good profile first, change one setting, and keep a CMOS/recovery path.
              optimizationmaxxing does not apply or restore BIOS changes.
            </li>
            <li>
              <strong className="text-text">Validate stability</strong> — use a current bootable
              or in-OS memory test, then run the actual game workload. Watch for WHEA events,
              crashes, anti-cheat failures, and frametime regressions. Any error returns you to the
              last known-good profile; do not conceal it by raising voltage.
            </li>
            <li>
              <strong className="text-text">Verify in Windows</strong> — come back to this card and{' '}
              <button onClick={() => window.location.reload()} className="underline text-accent hover:text-text">refresh</button>;
              the "Speed" value should match the selected baseline. A different value can mean the
              board trained a fallback; record it rather than assuming the requested profile stuck.
            </li>
          </ol>
        </div>
      )}

      <div className="pt-3 border-t border-border space-y-1.5 text-[11px] text-text-subtle leading-snug">
        <p className="uppercase tracking-widest text-text-subtle text-[10px]">validation references</p>
        <p>
          <a className="underline hover:text-text" href="https://www.memtest86.com/" target="_blank" rel="noreferrer">
            MemTest86
          </a>{' '}
          — a bootable memory-validation reference. Follow its current documentation and retain
          the result with the hardware snapshot.
        </p>
        <p>
          <a className="underline hover:text-text" href="https://github.com/CoolCmd/TestMem5" target="_blank" rel="noreferrer">
            TestMem5
          </a>{' '}
          — an optional in-OS stress-test reference. Use a current configuration and treat a clean
          run as evidence, not a guarantee.
        </p>
        <p>
          For manual firmware experiments, use the motherboard and memory vendor's current
          recovery documentation. This app does not prescribe or write voltage/timing values.
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
        {isUnknown ? (
          <span className="text-[11px] uppercase tracking-widest px-2 py-0.5 rounded font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
            {m.icType}
          </span>
        ) : (
          <a
            href="#/guides?game=any#ram-bios-recipes"
            title={`Open the read-only memory stability audit for ${m.icType}`}
            className="text-[11px] uppercase tracking-widest px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/20 transition no-underline"
          >
            {m.icType} · audit →
          </a>
        )}
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
      {isUnknown && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5 mt-1 space-y-1">
          <p className="text-[11px] text-amber-200/90 font-semibold uppercase tracking-widest">
            We couldn't infer the IC die from the part number
          </p>
          <p className="text-[11px] text-text-muted leading-snug">
            Boutique kits, custom binning, and certain Crucial / Patriot / Klevv SKUs publish
            part numbers our heuristic doesn't recognize. Treat the missing label as unknown
            rather than guessing a timing or voltage value from a community table.
          </p>
          <ol className="ml-4 list-decimal text-[11px] text-text-muted leading-snug space-y-0.5">
            <li>
              Confirm the exact part number against the manufacturer or board support list. If you
              need deeper SPD evidence, use a vendor-trusted read-only tool and retain the output;
              it still does not prove that a manual profile is stable.
            </li>
          </ol>
          <p className="text-[11px] text-text-muted leading-snug pt-1">
            For the safe workflow, go to{' '}
            <a className="underline text-accent hover:text-text" href="#/guides?game=any#ram-bios-recipes">
              /guides → RAM stability audit
            </a>{' '}
            and follow the baseline and validation steps.
          </p>
        </div>
      )}
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
