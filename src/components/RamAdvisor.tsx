import { lookupKit } from '../lib/ramAdvisor'
import type { RamInfo } from '../lib/tauri'

/**
 * RAM Advisor card — what kit you have, what it's actually capable of,
 * what to type into BIOS to unlock it. Pure intel surface; no system
 * changes are emitted from this component (BIOS work stays manual).
 *
 * Stability test launcher embeds here so users can verify before+after
 * changes from the same place.
 */
export function RamAdvisor({ ram }: { ram: RamInfo }) {
  const kit = lookupKit(ram.partNumber)

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
          which we haven't profiled yet. Add it via Discord and we'll get tuning targets up.
        </p>
        <StabilityLauncher />
      </div>
    )
  }

  const running = ram.configuredSpeedMts ?? ram.speedMts ?? 0
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
          Likely silicon: <span className="text-accent">{kit.die_inferred}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <KitStat
          label="Rated"
          value={`${kit.rated_speed_mts} MT/s`}
          sub={`${kit.rated_timings} @ ${kit.rated_voltage_v}V`}
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
              ? 'JEDEC fallback — turn on XMP!'
              : 'Manual / custom profile'
          }
          highlight={dropToJedec ? 'warn' : onXmp ? 'good' : undefined}
        />
        <KitStat
          label="Stability cfg"
          value={kit.tm5_config}
          sub="for TestMem5"
        />
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-text-subtle mb-2">
          tunable targets
        </p>
        <div className="space-y-2">
          {kit.tunable_targets.map((t, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 text-sm border border-border rounded-md p-3"
            >
              <div className="min-w-0">
                <p className="text-text font-medium tabular-nums">
                  {t.speed_mts} MT/s · {t.timings} · {t.voltage_v}V
                </p>
                <p className="text-xs text-text-subtle">
                  {t.platform} · {t.notes}
                </p>
              </div>
              <DifficultyChip d={t.difficulty} />
            </div>
          ))}
        </div>
      </div>

      {kit.notes && (
        <p className="text-xs text-text-muted italic border-l-2 border-accent pl-3">
          {kit.notes}
        </p>
      )}

      <p className="text-xs text-text-subtle">
        Apply targets in BIOS manually. We refuse to write DRAM training in software — kernel-mode
        SPD writes risk anti-cheat flags + brick rigs. Type these into BIOS yourself,{' '}
        <span className="text-text">save</span>, run a stability test below.
      </p>

      <StabilityLauncher />
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

function DifficultyChip({ d }: { d: 'Easy' | 'Medium' | 'Hard' }) {
  return (
    <span
      className={`shrink-0 text-[10px] uppercase tracking-widest px-2 py-1 rounded border border-border ${
        d === 'Easy'
          ? 'text-text-muted'
          : d === 'Medium'
          ? 'text-text'
          : 'text-accent font-semibold'
      }`}
    >
      {d}
    </span>
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
