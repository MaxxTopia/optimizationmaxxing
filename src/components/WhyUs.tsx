/**
 * Keep this strip grounded in capabilities we can verify in our own build.
 * Competitor packaging and feature claims change; the comparison research
 * page is the right place for time-stamped external comparisons.
 */
const POINTS = [
  {
    metric: '100',
    label: 'curated tweaks',
    body: 'Risk-graded catalog actions with explicit evidence tiers and per-action recovery data.',
  },
  {
    metric: '8',
    label: 'themes',
    body: 'Val · Sonic · DMC · Zombies · anime · cartoon palettes. Switch the entire UI in one click.',
  },
  {
    metric: 'snapshot',
    label: 'tweak undo',
    body: 'Snapshot-backed actions get per-tweak revert. Script-based lanes show their recovery path, and failed reverts stay visible.',
  },
  {
    metric: 'scan-gated',
    label: 'curation',
    body: 'Eligibility checks use your CPU, GPU, RAM, board, and Windows build before a lane is offered.',
  },
]

export function WhyUs() {
  return (
    <section className="space-y-4">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">edge</p>
        <h2 className="text-2xl font-bold">What we do differently</h2>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {POINTS.map((p) => (
          <div key={p.label} className="surface-card p-4">
            <p className="text-xl font-bold text-accent leading-tight">{p.metric}</p>
            <p className="text-xs uppercase tracking-widest text-text-subtle mb-2">
              {p.label}
            </p>
            <p className="text-xs text-text-muted leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
