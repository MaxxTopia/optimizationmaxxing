import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { UpdateBanner } from './components/UpdateBanner'
import { WhatsNewModal } from './components/WhatsNewModal'
import { Dashboard } from './pages/Dashboard'
import { Tweaks } from './pages/Tweaks'
import { Presets } from './pages/Presets'
import { Profile } from './pages/Profile'
import { Toolkit } from './pages/Toolkit'
import { Guides } from './pages/Guides'
import { Grind } from './pages/Grind'
import { Asta } from './pages/Asta'
import { Benchmark } from './pages/Benchmark'
import { Pricing } from './pages/Pricing'
import { Settings } from './pages/Settings'
import { Changelog } from './pages/Changelog'
import { Diagnostics } from './pages/Diagnostics'
import { Session } from './pages/Session'
import { inTauri } from './lib/tauri'
import { invoke } from '@tauri-apps/api/core'

const SPLASH_MIN_MS = 1200 // give the neon ripple at least one full sweep

export default function App() {
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
    return () => window.clearTimeout(t)
  }, [])

  return (
    <Layout>
      <UpdateBanner />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tweaks" element={<Tweaks />} />
        <Route path="/presets" element={<Presets />} />
        <Route path="/toolkit" element={<Toolkit />} />
        <Route path="/guides" element={<Guides />} />
        <Route path="/grind" element={<Grind />} />
        <Route path="/asta" element={<Asta />} />
        <Route path="/benchmark" element={<Benchmark />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/diagnostics" element={<Diagnostics />} />
        <Route path="/session" element={<Session />} />
      </Routes>
      <WhatsNewModal />
    </Layout>
  )
}
