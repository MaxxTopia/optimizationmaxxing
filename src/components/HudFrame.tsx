import type { ReactNode } from 'react'

/**
 * BO3-themed HUD corner-bracket wrapper. No-op outside the bo3 profile —
 * the .bo3-hud-frame CSS in index.css only fires under `body.profile-bo3`.
 *
 * Wrap any card-shaped element you want to flag as a "high-info HUD
 * panel" — RAM advisor, DPC snapshot, microcode card. The brackets are
 * pure CSS pseudo-elements on this wrapper + the inner div, so this
 * component adds no runtime cost.
 */
export function HudFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bo3-hud-frame">
      <div className="bo3-hud-frame__inner">{children}</div>
    </div>
  )
}
