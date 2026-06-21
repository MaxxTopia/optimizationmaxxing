import { useEffect, useRef, useState } from 'react'

import { openExternal } from '../lib/tauri'
import { MAXXER_PRODUCTS, monogram, type MaxxerProduct } from '../lib/maxxerProducts'

/**
 * Maxxer suite sidebar — React port of `maxxtopia/src/components/MaxxerSidebar.astro`.
 * Same rail, same indigo "fidget orb" minimize/expand control with breathing
 * pulse + smoke trail, same DMC-3 "Banish/Unleash the Menu" tooltip, same
 * per-item accent + click electricity zap. Stays in sync with maxxtopia.com
 * so the desktop app and the website read as the same product family.
 *
 * Keyboard / a11y:
 *  - Each rail item is a `<button>` (hover tooltip + click navigates to the
 *    product's deployedUrl in a new tab, since this is an in-app sibling
 *    switcher, not an in-router link).
 *  - The optimizationmaxxing slot shows as active and is non-clickable.
 *  - Reduced-motion preference disables the click-zap animation.
 */

const STORAGE_KEY = 'optmaxxing_sidebar_open'
const ACTIVE_SLUG = 'optimizationmaxxing'

// ── Orb sounds — real Devil May Cry menu SFX (shared with dropmaxxer +
//    maxxtopia.com). Unleash (open) = full pitch; Banish (close) = pitched
//    down a touch + slightly quieter so the two are distinguishable but read
//    as one identity. Audio at public/audio/dmc-menu.mp3.
let _menuBase: HTMLAudioElement | null = null
function _playMenu(vol: number, rate: number) {
  try {
    if (!_menuBase) {
      _menuBase = new Audio('/audio/dmc-menu.mp3')
      _menuBase.preload = 'auto'
    }
    const a = _menuBase.cloneNode(true) as HTMLAudioElement
    a.volume = Math.max(0, Math.min(1, vol))
    a.playbackRate = rate
    a.currentTime = 0
    const p = a.play()
    if (p && p.catch) p.catch(() => { /* autoplay gate — ignore until gesture */ })
  } catch { /* no-op */ }
}
// Levels matched exactly to dropmaxxer's default output:
// SAMPLE_BASE_VOL(0.16) * masterVol(0.5) * trim(3.0 | 3.5) = 0.24 | 0.28.
function playSidebarMinimize() { _playMenu(0.24, 0.85) } // Banish (close)
function playSidebarExpand() { _playMenu(0.28, 1.0) }    // Unleash (open)
// The Maxxtopia community Discord. Click on the suite-M logo opens it.
// Update if the canonical invite ever changes (also lives in
// optimizationmaxxing's Pricing.tsx + SuggestTweakModal).
const MAXXTOPIA_DISCORD_INVITE = 'https://discord.gg/S78eecbWdx'

export function MaxxerSidebar() {
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === null ? true : v === '1'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
    document.body.classList.toggle('sidebar-collapsed', !open)
  }, [open])

  return (
    <>
      {open && (
        <aside className="maxxer-sidebar" aria-label="Maxxer suite">
          <FidgetOrb
            direction="minimize"
            ariaLabel="hide suite navigation"
            tooltipText="Banish the Menu"
            onClick={() => { playSidebarMinimize(); setOpen(false) }}
            className="maxxer-sidebar-close"
          />

          <button
            type="button"
            onClick={() => { void openExternal(MAXXTOPIA_DISCORD_INVITE) }}
            className="maxxer-sidebar-root"
            aria-label="Join the Maxxtopia Discord"
            title="Join the Maxxtopia Discord"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="sidebar-logo-glyph">
              <path
                className="sidebar-logo-cyan"
                d="M 4 19.5 L 4 4.5 L 12 13.5 L 20 4.5 L 20 19.5"
                stroke="#00d4ff" strokeWidth="3.2"
                strokeLinecap="round" strokeLinejoin="round" fill="none"
              />
              <path
                className="sidebar-logo-magenta"
                d="M 4 19.5 L 4 4.5 L 12 13.5 L 20 4.5 L 20 19.5"
                stroke="#e25bff" strokeWidth="3.2"
                strokeLinecap="round" strokeLinejoin="round" fill="none"
              />
              <path
                d="M 4 19.5 L 4 4.5 L 12 13.5 L 20 4.5 L 20 19.5"
                stroke="#ffffff" strokeWidth="1.9"
                strokeLinecap="round" strokeLinejoin="round" fill="none"
              />
            </svg>
          </button>

          <div className="maxxer-sidebar-divider" />

          <nav className="maxxer-sidebar-rail">
            {MAXXER_PRODUCTS.map((p) => (
              <ProductItem key={p.slug} product={p} />
            ))}
          </nav>
        </aside>
      )}
      {!open && (
        <FidgetOrb
          direction="expand"
          ariaLabel="open suite navigation"
          tooltipText="Unleash the Menu"
          onClick={() => { playSidebarExpand(); setOpen(true) }}
          className="maxxer-sidebar-opener"
        />
      )}
    </>
  )
}

function ProductItem({ product }: { product: MaxxerProduct }) {
  const isActive = product.slug === ACTIVE_SLUG
  const isLive = product.status === 'live'
  const isComingSoon = product.status === 'soon' || product.status === 'dev'
  const ref = useRef<HTMLButtonElement | null>(null)

  function handleClick() {
    if (isActive) return
    const target = product.deployedUrl ?? `https://maxxtopia.com/${product.slug}`
    void openExternal(target)
    // Re-trigger the zap animation on each click.
    const el = ref.current
    if (!el) return
    el.classList.remove('is-zapping')
    void el.offsetWidth // force reflow
    el.classList.add('is-zapping')
    window.setTimeout(() => el.classList.remove('is-zapping'), 800)
  }

  const cls = [
    'maxxer-sidebar-item',
    isActive && 'is-active',
    isLive && 'is-live',
    isComingSoon && 'is-soon',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      className={cls}
      style={{ ['--accent' as string]: product.accentHex }}
      aria-current={isActive ? 'page' : undefined}
      aria-label={product.name}
    >
      <span className="maxxer-sidebar-icon">
        {product.logo ? (
          <img src={product.logo} alt="" width={24} height={24} />
        ) : (
          <span className="maxxer-sidebar-monogram">{monogram(product.name)}</span>
        )}
      </span>
      {isComingSoon && (
        <span className="maxxer-sidebar-lock" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a5 5 0 0 0-5 5v3H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z" />
          </svg>
        </span>
      )}
      <span className="maxxer-sidebar-tooltip">
        {product.name}
        {product.status === 'soon' ? ' · coming soon' : product.status === 'dev' ? ' · in development' : ''}
      </span>
    </button>
  )
}

function FidgetOrb({
  direction,
  ariaLabel,
  tooltipText,
  onClick,
  className,
}: {
  direction: 'minimize' | 'expand'
  ariaLabel: string
  tooltipText: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`fidget-orb fidget-orb--${direction} has-dmc-tooltip ${className ?? ''}`}
    >
      <span className="aura-smoke" aria-hidden="true" />
      <span className="aura-smoke-3" aria-hidden="true" />
      <span className="fidget-orb__arrow">{direction === 'minimize' ? '▶' : '◀'}</span>
      <span className="dmc-tooltip">{tooltipText}</span>
    </button>
  )
}
