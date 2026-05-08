/**
 * 3-step explainer ribbon. Mirrors Paragon's "How Does It Work?" but
 * positioned around our spec-aware automation, not their manual service.
 */
const STEPS = [
  {
    num: '01',
    title: 'Detect your rig',
    body: 'CPU vendor + generation, GPU architecture, RAM, OS build, BIOS — all read live, no upload.',
  },
  {
    num: '02',
    title: 'Pick a preset',
    body: 'Esports preset for lowest input lag · BR preset for max FPS · Streamer preset for stutter-free recording.',
  },
  {
    num: '03',
    title: 'Apply, undo, repeat',
    body: 'Every tweak is recorded with its prior value. One click reverts a tweak; one click reverts the entire session.',
  },
]

export function HowItWorks() {
  return (
    <section className="space-y-4">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">how it works</p>
        <h2 className="text-2xl font-bold">From boot to optimized in 60 seconds</h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map((s) => (
          <div key={s.num} className="surface-card p-6 relative">
            <p className="text-5xl font-bold text-accent/30 leading-none mb-3 tabular-nums">
              {s.num}
            </p>
            <h3 className="text-lg font-semibold text-text mb-1.5">{s.title}</h3>
            <p className="text-sm text-text-muted leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
