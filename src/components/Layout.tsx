import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MaxxerSidebar } from './MaxxerSidebar'
import { ThemePicker } from './ThemePicker'

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/tune', label: 'Tune now' },
  { to: '/tweaks', label: 'Tweaks' },
  { to: '/presets', label: 'Presets' },
  { to: '/diff', label: 'Your Tune' },
  { to: '/guides', label: 'Guides' },
  { to: '/grind', label: 'Grind' },
  { to: '/hardware', label: 'Hardware' },
  { to: '/asta', label: 'Asta' },
  { to: '/toolkit', label: 'Toolkit' },
  { to: '/diagnostics', label: 'Diagnostics' },
  { to: '/session', label: 'Session' },
  { to: '/profile', label: 'Profile' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/settings', label: 'Settings' },
  { to: '/updates', label: 'Updates' },
]

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()

  useEffect(() => {
    // Reset to top of page on route change. Without this, navigating
    // from the bottom of a long page (e.g. /grind) drops the user halfway
    // down the next page.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  return (
    <div className="app-shell flex min-h-screen bg-bg-base text-text">
      <MaxxerSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 backdrop-blur bg-bg-base border-b border-border">
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-6">
              <Link to="/" className="font-bold tracking-tight text-text hover:text-accent transition">
                optimizationmaxxing
              </Link>
              <nav className="hidden md:flex items-center gap-1">
                {NAV_LINKS.map((l) => {
                  const active = location.pathname === l.to
                  return (
                    <Link
                      key={l.to}
                      to={l.to}
                      className={`px-3 py-1.5 rounded-md text-sm transition ${
                        active
                          ? 'text-text bg-bg-raised'
                          : 'text-text-muted hover:text-text hover:bg-bg-raised'
                      }`}
                    >
                      {l.label}
                    </Link>
                  )
                })}
              </nav>
            </div>
            <ThemePicker />
          </div>
        </header>
        <main className="flex-1 px-6 py-8 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}
