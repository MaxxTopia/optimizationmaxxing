import { useEffect } from 'react'
import { inTauri } from '../lib/tauri'
import { reconcile } from '../lib/tournamentDriver'

/**
 * Headless, always-mounted driver for Tournament Mode. Renders nothing.
 *
 * Mounted once at the App root (NOT inside the Asta page) so the scheduled
 * anti-cheat revert/restore fires regardless of which page is open — and runs
 * once immediately on app launch to catch up a schedule whose fire time passed
 * while the app was closed-then-reopened. This is the fix for the ban-risk where
 * the old page-scoped driver silently stopped when you navigated away.
 */
export function TournamentModeDriver() {
  useEffect(() => {
    if (!inTauri()) return
    let cancelled = false
    const run = () => {
      if (!cancelled) reconcile().catch(() => {})
    }
    run() // app-launch catch-up
    const id = window.setInterval(run, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])
  return null
}
