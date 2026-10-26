interface PinnacleCoverageCardProps {
  automaticCount: number | null
  eligibleCount: number
  alreadyOnTarget: number
  reviewCount: number
  manualCount: number
  excludedCount: number
  isLaptop: boolean
}

/**
 * A small, honest map of what Asta can do automatically on this machine.
 * Counts come from the current rig-aware plan; the lanes below explain why
 * the rest of the tuning surface is not silently folded into Apply all.
 */
export function PinnacleCoverageCard({
  automaticCount,
  eligibleCount,
  alreadyOnTarget,
  reviewCount,
  manualCount,
  excludedCount,
  isLaptop,
}: PinnacleCoverageCardProps) {
  const automaticLabel = automaticCount == null ? 'Run review' : `${automaticCount}`
  const automaticDetail = automaticCount == null
    ? 'The exact live read-back has not run yet.'
    : 'Supported rows with a complete native read-back and restore contract.'

  return (
    <section className="mt-3 rounded-md border border-emerald-300/20 bg-emerald-300/5 p-3 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-emerald-200/80">pinnacle coverage</p>
          <h4 className="text-sm font-semibold text-text">What Asta can actually change on this PC</h4>
        </div>
        <p className="text-[11px] text-text-subtle">No router, BIOS, firmware, or physical-device writes</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CoverageStat label="Automatic now" value={automaticLabel} detail={automaticDetail} tone="emerald" />
        <CoverageStat label="Already correct" value={alreadyOnTarget} detail="Read as matching and skipped without a write." tone="sky" />
        <CoverageStat label="Optional review" value={reviewCount} detail="Visible for deliberate review; not hidden from you." tone="amber" />
        <CoverageStat label="Plan rows" value={eligibleCount} detail="Hardware-matched software rows in this game plan." tone="text" />
      </div>

      <div className="grid gap-2 text-[11px] leading-snug text-text-muted sm:grid-cols-3">
        <CoverageLane
          title="Automatic lane"
          body="Windows performance, power, input, process, and exposed NIC controls are selected only when the live state is readable and reversible. The main button applies this lane in one guided run."
          tone="emerald"
        />
        <CoverageLane
          title="Optional lane"
          body={`CPU Sets, NVIDIA Profile Inspector, driver-specific advanced properties, and other situational rows stay explicit because their effect depends on the exact driver or game. ${reviewCount} review row${reviewCount === 1 ? '' : 's'} remain visible.`}
          tone="amber"
        />
        <CoverageLane
          title="Outside the app"
          body={`${manualCount} firmware/manual row${manualCount === 1 ? '' : 's'} and ${excludedCount} hardware/game-excluded row${excludedCount === 1 ? '' : 's'} stay visible instead of being silently substituted. ${isLaptop ? 'Laptop power and thermal policy is preserved instead of forcing a desktop plan.' : 'Desktop power changes still retain an app-owned restore path.'}`}
          tone="sky"
        />
      </div>

      <p className="text-[11px] leading-snug text-text-subtle">
        “Automatic” means the app can prove the setting was read and restored on this Windows
        install. It does not mean every setting improves every game, changes ISP/server ping, or
        guarantees zero input delay. Real Fortnite FPS, 1% lows, and input feel still require the
        same-scene Match Scan after reboot.
      </p>
    </section>
  )
}

function CoverageStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string | number
  detail: string
  tone: 'emerald' | 'sky' | 'amber' | 'text'
}) {
  const valueClass = tone === 'emerald'
    ? 'text-emerald-300'
    : tone === 'sky'
      ? 'text-sky-300'
      : tone === 'amber'
        ? 'text-amber-200'
        : 'text-text'
  return (
    <div className="rounded border border-white/10 bg-black/10 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-text-subtle">{detail}</p>
    </div>
  )
}

function CoverageLane({
  title,
  body,
  tone,
}: {
  title: string
  body: string
  tone: 'emerald' | 'amber' | 'sky'
}) {
  const titleClass = tone === 'emerald'
    ? 'text-emerald-300'
    : tone === 'amber'
      ? 'text-amber-200'
      : 'text-sky-300'
  return (
    <div className="rounded border border-white/10 bg-black/10 px-2.5 py-2">
      <p className={`font-semibold ${titleClass}`}>{title}</p>
      <p className="mt-1">{body}</p>
    </div>
  )
}
