import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { CrashBoundary } from './components/CrashBoundary'
import { Layout } from './components/Layout'
import { NeptrTipsToast } from './components/NeptrTipsToast'
import { UpdateBanner } from './components/UpdateBanner'
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
import { Diff } from './pages/Diff'
import { Pricing } from './pages/Pricing'
import { Settings } from './pages/Settings'
import { Changelog } from './pages/Changelog'
import { Diagnostics } from './pages/Diagnostics'
import { Session } from './pages/Session'
import { inTauri, openExternal, telemetrySendEvent } from './lib/tauri'
import { invoke } from '@tauri-apps/api/core'
import { useProfileStore } from './store/useProfileStore'

const SPLASH_MIN_MS = 1200 // give the neon ripple at least one full sweep

export default function App() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
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
          <Route path="/diff" element={<Diff />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/updates" element={<Changelog />} />
          {/* legacy route kept for any in-app deep-links from old modals */}
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/session" element={<Session />} />
        </Routes>
        <WhatsNewModal />
        <NeptrTipsToast />
      </Layout>
    </CrashBoundary>
  )
}
