import { useEffect, type ReactNode } from 'react'
import { useProfileStore } from '../store/useProfileStore'
import { PROFILE_ORDER, profiles } from './profiles'

/**
 * Applies the active profile theme to :root via CSS custom properties
 * and toggles the matching `profile-<id>` class on <body> so per-theme
 * component overrides in index.css can fire.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const activeProfile = useProfileStore((s) => s.activeProfile)

  useEffect(() => {
    const theme = profiles[activeProfile]
    if (!theme) return

    const root = document.documentElement
    Object.entries(theme.vars).forEach(([k, v]) => {
      root.style.setProperty(k, v)
    })

    // Drop any prior profile- body class, set the active one.
    const body = document.body
    PROFILE_ORDER.forEach((id) => body.classList.remove(profiles[id].bodyClass))
    body.classList.add(theme.bodyClass)
  }, [activeProfile])

  return <>{children}</>
}
