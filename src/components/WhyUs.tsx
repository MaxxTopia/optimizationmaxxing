/**
 * "Why optimizationmaxxing" differentiator strip. Lean into wins
 * vs paragontweaks (manual service, 81MB) and hone.gg (one-size-fits-all,
 * single theme, 2.4M users but shallow per-tweak control).
 */
const POINTS = [
  {
    metric: '5 MB',
    label: 'installer',
    body: 'Tauri build vs Paragon\'s 81 MB and Hone\'s heavier electron bundles.',
  },
  {
    metric: '4',
    label: 'themes',
    body: 'Val · Sonic · DMC · BO3. Switch the entire UI in one click. Competitors ship one.',
  },
  {
    metric: 'every',
    label: 'tweak undo',
    body: 'Each apply records its pre-state. Per-tweak revert. Hone offers a single rollback; we go granular.',
  },
  {
    metric: 'spec-aware',
    label: 'curation',
    body: 'Tweaks gate on your CPU gen, GPU arch, OS build. No more "this might brick your laptop".',
  },
]

export function WhyUs() {
  return (
    <section className="space-y-4">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">edge</p>
        <h2 className="text-2xl font-bold">Why we beat the rest</h2>
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
