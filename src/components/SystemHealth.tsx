import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalog, tweakMatchesSpec, type TweakRecord } from '../lib/catalog'
import { PRESETS } from '../lib/presets'
import { listApplied, type SpecProfile } from '../lib/tauri'

/**
 * Single-glance "how tuned is this rig" score, 0-100. Derived from:
 *   - applied tweaks (free + vip weighted)
 *   - missed safe (risk 1) recommendations that match the rig
 *
 * Score is normalized so that ~half the catalog applied = ~80, and a
 * fully-applied competitive-FPS-style preset = ~95. Saturates at 100.
 */
interface Props {
  spec: SpecProfile | null
}

const MAX_SCORE = 100
const BASE = 30 // every rig starts at 30 — running stock Windows isn't 0.

export function SystemHealth({ spec }: Props) {
  const [applied, setApplied] = useState<Set<string>>(new Set())

  useEffect(() => {
    listApplied()
      .then((rows) =>
        setApplied(
          new Set(rows.filter((r) => r.status === 'applied').map((r) => r.tweakId)),
        ),
      )
      .catch(() => {
        /* not in Tauri */
      })
  }, [])

  const score = useMemo(() => computeScore(catalog.tweaks, applied, spec), [applied, spec])
  const grade = scoreGrade(score.value)
  const blocker = useMemo(
    () => topBlockingCategory(catalog.tweaks, applied, spec),
    [applied, spec],
  )

  return (
    <section className="surface-card p-6 md:p-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-25"
        style={{
          background: `radial-gradient(circle at top left, ${grade.gradientColor} 0%, transparent 65%)`,
        }}
      />
      <div className="relative grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
        <div className="flex flex-col items-center md:items-start">
          <p className="text-xs uppercase tracking-widest text-text-subtle">tune score</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className="text-6xl font-bold leading-none"
              style={{ color: grade.color }}
            >
              {score.value}
            </span>
            <span className="text-2xl font-bold text-text-subtle">/100</span>
          </div>
          <span
            className="text-sm font-semibold uppercase tracking-widest mt-2"
            style={{ color: grade.color }}
          >
            {grade.label}
          </span>
        </div>

        <div className="space-y-3 min-w-0">
          <div>
            <h3 className="text-lg font-semibold">{grade.headline}</h3>
            <p className="text-sm text-text-muted leading-snug mt-1">{grade.subline}</p>
          </div>

          <div className="space-y-1.5">
            <Bar
              label="Applied tweaks"
              value={score.appliedCount}
              max={Math.max(20, score.eligibleCount)}
              color="var(--accent)"
              hint={`${score.appliedCount} of ${score.eligibleCount} rig-eligible`}
            />
            <Bar
              label="Safe recommendations open"
              value={score.openSafe}
              max={10}
              color="var(--secondary)"
              hint={
                score.openSafe === 0
                  ? 'all top safe tweaks applied'
                  : `${score.openSafe} risk-1 / risk-2 still unapplied`
              }
              inverted
            />
          </div>

          {blocker && score.value < 90 && (
            <div className="pt-1 text-xs">
              <span className="text-text-subtle">Lift the score: </span>
              <span className="text-text">
                {blocker.applied}/{blocker.eligible} {blocker.category} tweaks applied.
              </span>
              {blocker.suggestPreset && (
                <Link
                  to="/presets"
                  className="text-accent hover:underline ml-1"
                >
                  Try {blocker.suggestPreset.name}{blocker.suggestPreset.glyph ? ` ${blocker.suggestPreset.glyph}` : ''} →
                </Link>
              )}
            </div>
          )}

          <div className="pt-1">
            <Link
              to="/tweaks"
              className="text-xs text-text-muted hover:text-text underline"
            >
              See what would lift the score →
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

interface BlockerInfo {
  category: string
  applied: number
  eligible: number
  suggestPreset?: { id: string; name: string; glyph?: string }
}

function topBlockingCategory(
  all: TweakRecord[],
  applied: Set<string>,
  spec: SpecProfile | null,
): BlockerInfo | null {
  const counts = new Map<string, { eligible: number; applied: number }>()
  for (const t of all) {
    if (!tweakMatchesSpec(t, spec)) continue
    const c = counts.get(t.category) || { eligible: 0, applied: 0 }
    c.eligible += 1
    if (applied.has(t.id)) c.applied += 1
    counts.set(t.category, c)
  }
  let worst: { category: string; gap: number; applied: number; eligible: number } | null = null
  for (const [cat, { eligible, applied }] of counts) {
    if (eligible < 2) continue // skip tiny categories
    const gap = eligible - applied
    if (gap < 2) continue // skip categories that are nearly done
    if (!worst || gap > worst.gap) {
      worst = { category: cat, gap, applied, eligible }
    }
  }
  if (!worst) return null
  // Pick a preset that has at least 1 tweak in this category as the suggestion.
  const preset = PRESETS.find((p) =>
    p.tweakIds.some((id) => {
      const t = all.find((x) => x.id === id)
      return t?.category === worst!.category
    }),
  )
  return {
    category: worst.category,
    applied: worst.applied,
    eligible: worst.eligible,
    suggestPreset: preset
      ? { id: preset.id, name: preset.name, glyph: preset.glyph }
      : undefined,
  }
}

function Bar({
  label,
  value,
  max,
  color,
  hint,
  inverted = false,
}: {
  label: string
  value: number
  max: number
  color: string
  hint: string
  inverted?: boolean
}) {
  const pct = Math.min(100, (value / Math.max(1, max)) * 100)
  return (
    <div className="text-xs">
      <div className="flex justify-between mb-0.5">
        <span className="text-text-subtle uppercase tracking-widest">{label}</span>
        <span className="text-text-muted">{hint}</span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-card border border-border overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${inverted ? 100 - pct : pct}%`,
            background: color,
            opacity: inverted ? 0.6 : 1,
          }}
        />
      </div>
    </div>
  )
}

interface ScoreBreakdown {
  value: number
  appliedCount: number
  eligibleCount: number
  openSafe: number
}

function computeScore(
  all: TweakRecord[],
  applied: Set<string>,
  spec: SpecProfile | null,
): ScoreBreakdown {
  let raw = BASE
  let appliedCount = 0
  let eligibleCount = 0
  let openSafe = 0

  for (const t of all) {
    const matches = tweakMatchesSpec(t, spec)
    if (matches) eligibleCount += 1
    if (applied.has(t.id)) {
      appliedCount += 1
      // Free tweaks add 1.5, VIP tweaks add 2.5 (weighted to reward harder tunes).
      raw += t.vipGate === 'vip' ? 2.5 : 1.5
      // Risk-3/4 tweaks add a bit more (skin in the game).
      if (t.riskLevel >= 3) raw += 1
    } else if (matches && t.riskLevel <= 2) {
      openSafe += 1
    }
  }

  const value = Math.round(Math.min(MAX_SCORE, raw))
  return { value, appliedCount, eligibleCount, openSafe: Math.min(10, openSafe) }
}

function scoreGrade(score: number): {
  label: string
  color: string
  gradientColor: string
  headline: string
  subline: string
} {
  if (score >= 90)
    return {
      label: 'Tournament',
      color: '#42f5a7',
      gradientColor: 'rgba(66, 245, 167, 0.5)',
      headline: 'Tournament-grade tune',
      subline:
        'Your rig is running close to optimal. Frame pacing, scheduler bias, and background-process kills are all dialed in.',
    }
  if (score >= 75)
    return {
      label: 'Tuned',
      color: 'var(--accent)',
      gradientColor: 'rgba(255, 70, 85, 0.5)',
      headline: 'Solid tune — most low-hanging fruit applied',
      subline:
        'A few advanced tweaks (boot-store + memory mgmt) would push you into Tournament range.',
    }
  if (score >= 50)
    return {
      label: 'Lukewarm',
      color: '#ffb454',
      gradientColor: 'rgba(255, 180, 84, 0.4)',
      headline: 'Half-tuned — easy wins remain',
      subline:
        'Apply the Recommended Tweaks below or run a curated preset to climb fast.',
    }
  return {
    label: 'Stock',
    color: '#8e8579',
    gradientColor: 'rgba(142, 133, 121, 0.35)',
    headline: 'Running close to stock Windows',
    subline:
      'Start with the Recommended Tweaks below, or apply the Esports preset for a one-UAC sweep.',
  }
}
