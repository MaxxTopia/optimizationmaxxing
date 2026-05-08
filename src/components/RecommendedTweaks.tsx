import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalog, tweakMatchesSpec, type TweakRecord } from '../lib/catalog'
import { applyBatch, listApplied, type BatchItem, type SpecProfile } from '../lib/tauri'
import { useIsVip } from '../store/useVipStore'

/**
 * Top recommended unapplied tweaks for the user's specific rig.
 * Matches against TweakRecord.targets metadata, deprioritizes high-risk
 * and VIP-locked tweaks for free users, and surfaces 6 highest-leverage
 * options. Each card has its own one-UAC Apply.
 */

interface Props {
  spec: SpecProfile | null
}

const MAX_VISIBLE = 6

export function RecommendedTweaks({ spec }: Props) {
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isVip = useIsVip()

  async function refreshApplied() {
    try {
      const list = await listApplied()
      setAppliedIds(
        new Set(list.filter((a) => a.status === 'applied').map((a) => a.tweakId)),
      )
    } catch {
      /* not in Tauri — leave empty */
    }
  }

  useEffect(() => {
    refreshApplied()
  }, [])

  const recommended = useMemo(() => {
    return scoreTweaks(catalog.tweaks, spec, appliedIds, isVip).slice(0, MAX_VISIBLE)
  }, [spec, appliedIds, isVip])

  async function handleApply(t: TweakRecord) {
    setBusyId(t.id)
    setError(null)
    try {
      const items: BatchItem[] = t.actions.map((action) => ({ tweakId: t.id, action }))
      await applyBatch(items)
      await refreshApplied()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleApplyAll() {
    setBusyId('__all__')
    setError(null)
    try {
      const items: BatchItem[] = []
      for (const t of recommended) {
        if (appliedIds.has(t.id)) continue
        for (const action of t.actions) items.push({ tweakId: t.id, action })
      }
      if (items.length > 0) await applyBatch(items)
      await refreshApplied()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  if (recommended.length === 0) {
    return null
  }

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">tuned for your rig</p>
          <h2 className="text-2xl font-bold">Recommended tweaks</h2>
          <p className="text-sm text-text-muted">
            Top picks based on your CPU, GPU, RAM, and Windows build. Apply all under a single UAC,
            or pick individually.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/tweaks"
            className="text-text-muted hover:text-text text-sm transition"
          >
            Browse all {catalog.tweaks.length} →
          </Link>
          <button
            onClick={handleApplyAll}
            disabled={busyId !== null}
            className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-50"
          >
            {busyId === '__all__' ? 'Applying all…' : `Apply all ${recommended.length} (1 UAC)`}
          </button>
        </div>
      </header>

      {error && (
        <div className="surface-card p-3 text-sm text-accent">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {recommended.map((t) => (
          <RecCard
            key={t.id}
            tweak={t}
            busy={busyId === t.id}
            onApply={() => handleApply(t)}
          />
        ))}
      </div>
    </section>
  )
}

function RecCard({
  tweak,
  busy,
  onApply,
}: {
  tweak: TweakRecord
  busy: boolean
  onApply: () => void
}) {
  return (
    <div className="surface-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-text leading-tight">{tweak.title}</p>
          <p className="text-xs text-text-subtle uppercase tracking-widest mt-1">
            {tweak.category} · risk {tweak.riskLevel}
          </p>
        </div>
        {tweak.vipGate === 'vip' && (
          <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-accent text-accent shrink-0">
            VIP
          </span>
        )}
      </div>
      <p className="text-xs text-text-muted leading-snug line-clamp-3">
        {tweak.description}
      </p>
      <div className="mt-auto">
        <button
          onClick={onApply}
          disabled={busy}
          className="btn-chrome w-full px-3 py-2 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  )
}

interface SpecLike {
  cpu?: { vendor?: string | null }
  gpu?: { vendor?: string | null }
  os?: { build?: number | null }
  ram?: { totalGb?: number | null }
}

/** Score + sort tweaks by recommendation strength. Low risk + free tier
 * float to the top; specifically-targeted tweaks (i.e. tweak has a `targets`
 * block matching this rig) get a boost. */
function scoreTweaks(
  all: TweakRecord[],
  spec: SpecLike | null,
  applied: Set<string>,
  isVip: boolean,
): TweakRecord[] {
  type Scored = { t: TweakRecord; score: number }
  const scored: Scored[] = []
  for (const t of all) {
    if (applied.has(t.id)) continue
    if (!tweakMatchesSpec(t, spec)) continue
    let score = 0
    // Free first if user isn't VIP.
    if (!isVip && t.vipGate === 'free') score += 5
    if (isVip || t.vipGate === 'free') score += 1
    // Lower risk = stronger recommendation.
    score += 4 - t.riskLevel
    // Specifically-targeted = stronger signal that this tweak is FOR this rig.
    if (t.targets) score += 3
    // No reboot required = lower friction.
    if (t.rebootRequired === 'none') score += 1
    // Anti-cheat-safe preferred for the surface.
    if (t.anticheatRisk === 'none') score += 1
    scored.push({ t, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.t)
}
