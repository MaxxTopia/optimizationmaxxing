import { useMemo, useState } from 'react'

/**
 * Manual logger for canonical industry benchmarks. Asta Bench measures
 * the four metrics that map to Fortnite click-to-pixel cost; this card
 * lets users log their Cinebench / Time Spy / Steel Nomad / Speed Way
 * runs to anchor the relative deltas Asta Bench shows. Persisted to
 * localStorage; per-benchmark history table + delta vs previous run.
 */

const STORE_KEY = 'optmaxxing-third-party-bench-scores'

export type BenchKind =
  | 'cinebench-r23-multi'
  | 'cinebench-r23-single'
  | 'cinebench-2024-multi'
  | 'cinebench-2024-single'
  | 'time-spy'
  | 'time-spy-extreme'
  | 'steel-nomad'
  | 'speed-way'
  | 'firestrike'
  | 'cs2-fps-bench'
  | 'fortnite-replay-fps'

const BENCH_LABELS: Record<BenchKind, { label: string; unit: string; hint: string }> = {
  'cinebench-r23-multi': { label: 'Cinebench R23 (multi)', unit: 'pts', hint: 'CPU all-core, 10 min run' },
  'cinebench-r23-single': { label: 'Cinebench R23 (single)', unit: 'pts', hint: 'CPU single-thread' },
  'cinebench-2024-multi': { label: 'Cinebench 2024 (multi)', unit: 'pts', hint: 'newer Cinebench, all-core' },
  'cinebench-2024-single': { label: 'Cinebench 2024 (single)', unit: 'pts', hint: 'newer Cinebench, ST' },
  'time-spy': { label: '3DMark Time Spy', unit: 'pts', hint: 'DX12 GPU benchmark' },
  'time-spy-extreme': { label: '3DMark Time Spy Extreme', unit: 'pts', hint: '4K DX12' },
  'steel-nomad': { label: '3DMark Steel Nomad', unit: 'pts', hint: 'modern DX12 / Vulkan' },
  'speed-way': { label: '3DMark Speed Way', unit: 'pts', hint: 'ray-tracing' },
  firestrike: { label: '3DMark Fire Strike', unit: 'pts', hint: '1080p DX11' },
  'cs2-fps-bench': { label: 'CS2 FPS bench (de_dust2 demo)', unit: 'fps', hint: 'avg fps from CSGO Workshop benchmark' },
  'fortnite-replay-fps': { label: 'Fortnite replay avg FPS', unit: 'fps', hint: 'FPS counter avg over a replay' },
}

interface BenchScore {
  ts: string
  kind: BenchKind
  score: number
  label: string
}

export function ThirdPartyBenchLogger() {
  const [history, setHistory] = useState<BenchScore[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '[]')
    } catch {
      return []
    }
  })
  const [kind, setKind] = useState<BenchKind>('cinebench-r23-multi')
  const [score, setScore] = useState('')
  const [label, setLabel] = useState('')

  function persist(next: BenchScore[]) {
    setHistory(next)
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  }

  function addScore() {
    const n = parseFloat(score)
    if (!Number.isFinite(n) || n <= 0) return
    const entry: BenchScore = {
      ts: new Date().toISOString(),
      kind,
      score: n,
      label: label.trim() || `${BENCH_LABELS[kind].label}`,
    }
    persist([entry, ...history].slice(0, 200))
    setScore('')
    setLabel('')
  }

  function removeAt(idx: number) {
    persist(history.filter((_, i) => i !== idx))
  }

  // Group into per-kind buckets for delta-vs-previous display.
  const grouped = useMemo(() => {
    const map: Record<string, BenchScore[]> = {}
    for (const s of history) {
      if (!map[s.kind]) map[s.kind] = []
      map[s.kind].push(s)
    }
    return map
  }, [history])

  return (
    <section className="surface-card p-5 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-widest text-text-subtle">log · third-party</p>
        <h3 className="text-lg font-semibold">Cinebench / 3DMark / fps logger</h3>
        <p className="text-sm text-text-muted leading-snug max-w-2xl">
          Asta Bench measures the four metrics that move click-to-pixel. This logs canonical
          industry benchmarks alongside — run Cinebench R23 / 3DMark Time Spy yourself, type
          the score in here, see the delta vs your last run.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1 min-w-48">
          <span className="text-[10px] uppercase tracking-widest text-text-subtle">Benchmark</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as BenchKind)}
            className="px-2 py-1.5 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
          >
            {(Object.keys(BENCH_LABELS) as BenchKind[]).map((k) => (
              <option key={k} value={k}>
                {BENCH_LABELS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-text-subtle">
            Score ({BENCH_LABELS[kind].unit})
          </span>
          <input
            value={score}
            onChange={(e) => setScore(e.target.value)}
            inputMode="decimal"
            placeholder={BENCH_LABELS[kind].hint}
            className="px-3 py-1.5 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm w-44 tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-32">
          <span className="text-[10px] uppercase tracking-widest text-text-subtle">Label (optional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. before Asta / after RAM tightening"
            className="px-3 py-1.5 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
          />
        </label>
        <button
          onClick={addScore}
          disabled={!Number.isFinite(parseFloat(score)) || parseFloat(score) <= 0}
          className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
        >
          + Add
        </button>
      </div>

      {Object.keys(grouped).length === 0 && (
        <p className="text-xs text-text-subtle italic">
          No scores logged yet. Run Cinebench R23 ({' '}
          <a className="underline hover:text-text" href="https://www.maxon.net/en/downloads/cinebench-r23-downloads" target="_blank" rel="noreferrer">
            free
          </a>
          ) or 3DMark and paste the result above.
        </p>
      )}

      {Object.keys(grouped).length > 0 && (
        <div className="space-y-3">
          {(Object.keys(grouped) as BenchKind[]).map((k) => {
            const list = grouped[k]
            const latest = list[0]
            const prev = list[1]
            const delta = prev ? latest.score - prev.score : null
            const pct = prev ? (delta! / prev.score) * 100 : null
            return (
              <div key={k} className="surface-card p-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <p className="text-sm font-semibold">
                    {BENCH_LABELS[k].label}
                  </p>
                  <p className="text-[11px] text-text-subtle">{list.length} run(s)</p>
                </div>
                <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                  <span className="text-2xl font-bold tabular-nums">
                    {latest.score.toLocaleString()}
                    <span className="text-sm text-text-muted font-normal ml-1">
                      {BENCH_LABELS[k].unit}
                    </span>
                  </span>
                  {delta != null && pct != null && (
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-400' : 'text-text-subtle'
                      }`}
                    >
                      {delta >= 0 ? '+' : ''}
                      {delta.toLocaleString(undefined, { maximumFractionDigits: 1 })} ({pct >= 0 ? '+' : ''}
                      {pct.toFixed(1)}%) vs prev
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-0.5 text-[11px]">
                  {list.slice(0, 4).map((s, i) => {
                    const realIdx = history.indexOf(s)
                    return (
                      <li key={i} className="flex items-baseline justify-between gap-2 group">
                        <span className="text-text-muted truncate">
                          <span className="text-text-subtle">
                            {new Date(s.ts).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            ·
                          </span>{' '}
                          {s.label}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{s.score.toLocaleString()}</span>
                          <button
                            onClick={() => removeAt(realIdx)}
                            className="text-text-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

