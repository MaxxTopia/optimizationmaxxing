import { useProfileStore } from '../store/useProfileStore'

/**
 * Sonic's signature mascot floats in the Dashboard hero. It is theme-gated so
 * every other profile stays completely unchanged.
 */
export function SonicFastboi() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  if (activeProfile !== 'sonic') return null

  return (
    <div className="sonic-fastboi" aria-hidden="true">
      <div className="sonic-fastboi__ring sonic-fastboi__ring--one" />
      <div className="sonic-fastboi__ring sonic-fastboi__ring--two" />
      <div className="sonic-fastboi__mascot">
        <img src="/assets/fastboi__super.png" alt="" draggable={false} />
      </div>
    </div>
  )
}
