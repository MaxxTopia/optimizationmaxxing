import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AstaBenchHud } from '../components/AstaBenchHud'
import { AstaCard } from '../components/AstaCard'
import { GameBenchmark } from '../components/GameBenchmark'
import { HowItWorks } from '../components/HowItWorks'
import { QuickStart } from '../components/QuickStart'
import { RecentlyApplied } from '../components/RecentlyApplied'
import { RecommendedForRig } from '../components/RecommendedForRig'
import { RecommendedTweaks } from '../components/RecommendedTweaks'
import { RingGauge } from '../components/RingGauge'
import { SystemHealth } from '../components/SystemHealth'
import { WhyUs } from '../components/WhyUs'
import { useMetrics } from '../store/useMetrics'
import { detectSpecs, listApplied, type SpecProfile } from '../lib/tauri'

export function Dashboard() {
  const [spec, setSpec] = useState<SpecProfile | null>(null)
  const [appliedCount, setAppliedCount] = useState(0)
  const metrics = useMetrics(2000)

  useEffect(() => {
    let cancelled = false
    detectSpecs()
      .then((s) => !cancelled && setSpec(s))
      .catch(() => undefined)
    listApplied()
      .then((list) => !cancelled && setAppliedCount(list.filter((a) => a.status === 'applied').length))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const cpuPct = metrics?.cpuPercent ?? 0
  const ramPct = metrics?.ramPercent ?? 0
  const ramUsed = metrics ? `${metrics.ramUsedGb.toFixed(1)} GB` : '—'
  const ramTotal = metrics ? `of ${metrics.ramTotalGb.toFixed(0)} GB` : ''
  const cpuHint = spec ? truncate(spec.cpu.model, 28) : 'Detecting…'
  const tweakPct = appliedCount > 0 ? Math.min(100, (appliedCount / 30) * 100) : 0

  return (
    <div className="space-y-10">
      {/* HERO — name, tagline, primary CTAs */}
      <section className="relative overflow-hidden rounded-2xl p-8 md:p-10 surface-card">
        <div className="hero-gradient" />
        <div className="relative">
          <p className="text-xs uppercase tracking-widest text-text-subtle mb-3">
            optimizationmaxxing · v0.1
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mb-3 leading-tight">
            Max FPS. <span className="text-accent">Zero input lag.</span>
          </h1>
          <p className="text-text-muted max-w-2xl text-base md:text-lg">
            Spec-aware Windows tweaks for competitive gamers. Every change is undo-safe,
            curated to your exact rig, and ships in a 5 MB installer.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/tune"
              className="btn-chrome px-5 py-2.5 rounded-md bg-accent text-bg-base font-semibold"
              title="Scan your rig + apply every safe matching tweak in one UAC + see exact composite delta + see VIP gap. ~90 seconds."
            >
              Tune now (90 s) →
            </Link>
            <Link
              to="/tweaks"
              className="px-5 py-2.5 rounded-md border border-border text-text hover:border-border-glow transition"
            >
              Browse tweaks
            </Link>
            <Link
              to="/presets"
              className="px-5 py-2.5 rounded-md text-text-muted hover:text-text transition"
            >
              Curated presets →
            </Link>
          </div>
        </div>
      </section>

      {/* LIVE GAUGES */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RingGauge
          label="CPU USAGE"
          percent={cpuPct}
          value={`${Math.round(cpuPct)}%`}
          hint={cpuHint}
        />
        <RingGauge
          label="RAM"
          percent={ramPct}
          value={ramUsed}
          hint={ramTotal}
          color="var(--secondary)"
        />
        <RingGauge
          label="TWEAKS APPLIED"
          percent={tweakPct}
          value={String(appliedCount)}
          hint={appliedCount === 0 ? 'Browse the catalog →' : 'Reverts available in /tweaks'}
        />
      </section>

      <HowItWorks />

      <QuickStart />

      <SystemHealth spec={spec} />

      <RecommendedForRig spec={spec} />

      <RecommendedTweaks spec={spec} />

      <RecentlyApplied />

      <AstaBenchHud />

      <AstaCard />

      {/* GAME-BENCHMARK CLAIMS */}
      <section className="space-y-4">
        <header>
          <p className="text-xs uppercase tracking-widest text-text-subtle">benchmarks</p>
          <h2 className="text-2xl font-bold">Real gains on the games that matter</h2>
          <p className="text-sm text-text-muted">
            Targets sourced from creator-tested presets. Your mileage scales with your spec.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <GameBenchmark
            game="Fortnite"
            gain="+36% FPS"
            description="Faster builds, instant edits, smoother endgame storms."
          />
          <GameBenchmark
            game="Valorant"
            gain="+42% stability"
            description="Crisper input, tighter flicks, fewer dropped duels."
          />
          <GameBenchmark
            game="Apex Legends"
            gain="+27% FPS"
            description="Higher floor on dense maps like Kings Canyon and Olympus."
          />
          <GameBenchmark
            game="CS2 / Marvel Rivals / WZ"
            gain="lower 1% lows"
            description="Frame-pacing wins translate directly to peeker's-advantage wins."
          />
        </div>
      </section>

      <WhyUs />
    </div>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
