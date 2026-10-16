import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { CrashBoundary } from './components/CrashBoundary'
import { Layout } from './components/Layout'
import { Element115Vial } from './components/Element115Vial'
import { TipsToast } from './components/TipsToast'
import { UpdateBanner } from './components/UpdateBanner'
import { TournamentModeDriver } from './components/TournamentModeDriver'
import { WhatsNewModal } from './components/WhatsNewModal'
import { Dashboard } from './pages/Dashboard'
import { TuneNow } from './pages/TuneNow'
import { Tweaks } from './pages/Tweaks'
import { Presets } from './pages/Presets'
import { Profile } from './pages/Profile'
import { Toolkit } from './pages/Toolkit'
import { Guides } from './pages/Guides'
import { Grind } from './pages/Grind'
import { Hardware } from './pages/Hardware'
import { Asta } from './pages/Asta'
import { Benchmark } from './pages/Benchmark'
import { OptimizationLab } from './pages/OptimizationLab'
import { Diff } from './pages/Diff'
import { Pricing } from './pages/Pricing'
import { Settings } from './pages/Settings'
import { Changelog } from './pages/Changelog'
import { Diagnostics } from './pages/Diagnostics'
import { Session } from './pages/Session'
import { MatchScan } from './pages/MatchScan'
import { inTauri, openExternal, telemetrySendEvent, vipValidateOnline } from './lib/tauri'
import { invoke } from '@tauri-apps/api/core'
import { useProfileStore } from './store/useProfileStore'
import { useRigStore } from './store/useRigStore'
import { useVipStore } from './store/useVipStore'

const SPLASH_MIN_MS = 1200 // give the neon ripple at least one full sweep

export default function App() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const ensureRigLoaded = useRigStore((s) => s.ensureLoaded)
  const redeemedCode = useVipStore((s) => s.redeemedCode)
  const licenseSource = useVipStore((s) => s.licenseSource)
  const markServerValidated = useVipStore((s) => s.markServerValidated)
  const promoteToServerLicense = useVipStore((s) => s.promoteToServerLicense)
  const markClientClockSeen = useVipStore((s) => s.markClientClockSeen)
  const resetVip = useVipStore((s) => s.reset)
  useEffect(() => {
    if (!inTauri()) return
    const mountedAt = performance.now()
    const elapsed = performance.now() - mountedAt
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed)
    const t = window.setTimeout(() => {
      invoke('close_splashscreen').catch(() => {
        // Splash may already be closed, or running in non-tauri preview — fine.
      })
    }, wait)
    // Anonymous opt-in telemetry: fire app.launch on mount. Silent no-op
    // when telemetry is disabled (which is the default).
    telemetrySendEvent('app.launch', { profile: activeProfile })
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start one read-only hardware snapshot for the whole app. Individual pages
  // can force a refresh after a BIOS/driver/RAM change, but they all consume
  // the same result instead of racing separate WMI reads.
  useEffect(() => {
    void ensureRigLoaded()
  }, [ensureRigLoaded])

  // Server-backed VIP migration/lifecycle. Existing local-HMAC testers are
  // probed read-only and promoted only if the shared Worker recognizes the
  // code; an unrecognized legacy code is left alone for compatibility. Once
  // a code is server-backed, terminal Worker responses clear access while a
  // temporary network failure uses the store's bounded grace policy.
  useEffect(() => {
    if (!inTauri() || !redeemedCode) return
    let alive = true
    const check = async () => {
      markClientClockSeen()
      try {
        const result = await vipValidateOnline(redeemedCode)
        if (!alive) return
        if (result.ok && (result.status === 'valid' || result.status === 'claimed' || result.status === 'idempotent')) {
          if (licenseSource === 'server') markServerValidated(result.expiresAt ?? null)
          else promoteToServerLicense(result.expiresAt ?? null)
          return
        }
        if (licenseSource === 'server' && [
          'expired',
          'revoked',
          'hwid-mismatch',
          'hwid_mismatch',
          'reset-required',
          'reset_required',
          'scope-mismatch',
          'scope_mismatch',
          'unclaimed',
        ].includes(result.status)) {
          resetVip()
        }
      } catch {
        // Keep the cached state during a transient outage; useIsVip applies
        // the 24-hour server-backed grace and clock-rollback guard.
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 15 * 60 * 1000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [
    redeemedCode,
    licenseSource,
    markClientClockSeen,
    markServerValidated,
    promoteToServerLicense,
    resetVip,
  ])

  // Global anchor interceptor: route every `<a target="_blank">` click with
  // an external URL through plugin-shell's open(). Tauri 2 silently no-ops
  // popup-style navigations from the webview, so without this interceptor
  // every "open pon.wiki / liquipedia / discord / etc." link in the catalog
  // looks broken. 32 anchor sites in the app — handled here once instead of
  // touching each one. In-app router links (relative hrefs) are left alone.
  useEffect(() => {
    if (!inTauri()) return
    function isExternal(href: string): boolean {
      return /^(https?:|mailto:|discord:)/i.test(href)
    }
    function onClick(e: MouseEvent) {
      // Modifier keys / right-click / middle-click: respect default behavior.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return
      }
      const target = (e.target as HTMLElement | null)?.closest('a')
      if (!target) return
      const href = target.getAttribute('href') ?? ''
      const wantsNewTab =
        target.target === '_blank' || target.hasAttribute('data-external')
      if (!wantsNewTab || !isExternal(href)) return
      e.preventDefault()
      void openExternal(href)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <CrashBoundary>
      <Layout>
        <UpdateBanner />
        <TournamentModeDriver />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tune" element={<TuneNow />} />
          <Route path="/tweaks" element={<Tweaks />} />
          <Route path="/presets" element={<Presets />} />
          <Route path="/toolkit" element={<Toolkit />} />
          <Route path="/guides" element={<Guides />} />
          <Route path="/grind" element={<Grind />} />
          <Route path="/hardware" element={<Hardware />} />
          <Route path="/asta" element={<Asta />} />
          <Route path="/benchmark" element={<Benchmark />} />
          <Route path="/lab" element={<OptimizationLab />} />
          <Route path="/diff" element={<Diff />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/updates" element={<Changelog />} />
          {/* legacy route kept for any in-app deep-links from old modals */}
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/match-scan" element={<MatchScan />} />
          {/* Optional recovery utility; deliberately hidden from primary navigation because it is
              not a required optimization step and suspending processes is user-controlled. */}
          <Route path="/session" element={<Session />} />
        </Routes>
        <WhatsNewModal />
        <TipsToast />
        <Element115Vial />
      </Layout>
    </CrashBoundary>
  )
}
