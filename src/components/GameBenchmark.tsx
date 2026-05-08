/**
 * Game benchmark card showing claimed FPS gain. Mirror of paragontweaks +
 * hone.gg pattern but with our themed accent + crisper typography.
 */
interface GameBenchmarkProps {
  game: string
  /** e.g. "+36% FPS" */
  gain: string
  /** Detail line. */
  description: string
  /** Optional emoji/icon character (kept short). */
  icon?: string
}

export function GameBenchmark({ game, gain, description, icon }: GameBenchmarkProps) {
  return (
    <div className="surface-card p-5 relative overflow-hidden group">
      {icon && (
        <div className="absolute -right-4 -bottom-4 text-7xl opacity-10 select-none pointer-events-none">
          {icon}
        </div>
      )}
      <p className="text-xs uppercase tracking-widest text-text-subtle mb-1">
        {game}
      </p>
      <p className="text-2xl font-bold text-accent mb-2 tabular-nums">{gain}</p>
      <p className="text-sm text-text-muted leading-relaxed">{description}</p>
    </div>
  )
}
