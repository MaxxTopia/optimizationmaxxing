import { useProfileStore } from '../store/useProfileStore'

/**
 * Sonic's signature moment: the original Sprite Cannon Super Fastboi fires
 * through the corner of the app instead of sitting on the page as a poster.
 * It is theme-gated so every other profile stays completely unchanged.
 */
export function SonicFastboi() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  if (activeProfile !== 'sonic') return null

  return (
    <div className="sonic-fastboi" aria-hidden="true">
      <div className="sonic-fastboi__trail sonic-fastboi__trail--one" />
      <div className="sonic-fastboi__trail sonic-fastboi__trail--two" />
      <div className="sonic-fastboi__ring sonic-fastboi__ring--one" />
      <div className="sonic-fastboi__ring sonic-fastboi__ring--two" />
      <div className="sonic-fastboi__launcher">
        <span className="sonic-fastboi__mount" />
        <span className="sonic-fastboi__barrel" />
        <span className="sonic-fastboi__muzzle" />
        <span className="sonic-fastboi__spark" />
      </div>
      <div className="sonic-fastboi__shot">
        <img src="/assets/fastboi__super.png" alt="" draggable={false} />
      </div>
    </div>
  )
}
