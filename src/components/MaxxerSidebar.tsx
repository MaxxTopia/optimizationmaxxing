import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

/**
 * Slim left-rail nav for switching between maxxer-suite products. Lifted
 * verbatim from clipmaxxing/src/components/MaxxerSidebar.tsx but with `opt`
 * (optimizationmaxxing) flagged as the active in-app product.
 */

interface MaxxerProduct {
  id: string
  label: string
  monogram: string
  accent: string
  route: string
  external: boolean
  available: boolean
}

const PRODUCTS: MaxxerProduct[] = [
  { id: 'clip', label: 'clipmaxxer', monogram: 'CM', accent: '#e25bff', route: '#', external: true, available: false },
  { id: 'drop', label: 'dropmaxxer', monogram: 'DM', accent: '#e25bff', route: '#', external: true, available: false },
  { id: 'aim', label: 'aimmaxxer', monogram: 'AM', accent: '#00d4ff', route: '#', external: true, available: false },
  { id: 'edit', label: 'editmacros', monogram: 'EM', accent: '#f3af19', route: '#', external: true, available: false },
  { id: 'opt', label: 'optimizationmaxxing', monogram: 'OM', accent: '#4c51f7', route: '/', external: false, available: true },
  { id: 'view', label: 'viewmaxxing', monogram: 'VM', accent: '#10b981', route: '#', external: true, available: false },
]

const STORAGE_KEY = 'optmaxxing_sidebar_open'

export function MaxxerSidebar() {
  const location = useLocation()
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === null ? true : v === '1'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  }, [open])

  const activeId = resolveActiveProductId(location.pathname)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="open suite navigation"
        className="fixed top-3 left-3 z-30 size-9 rounded-md border border-border bg-bg-card text-text-muted hover:text-text hover:border-border-glow transition"
      >
        ◀
      </button>
    )
  }

  return (
    <aside className="hidden md:flex shrink-0 sticky top-0 self-start h-screen w-16 flex-col items-center py-3 gap-1 bg-bg-base border-r border-border z-20 relative">
      <button
        onClick={() => setOpen(false)}
        aria-label="hide suite navigation"
        className="absolute -right-3 top-3 z-10 size-6 rounded-full border border-border bg-bg-base text-text-muted hover:text-text hover:border-border-glow text-xs"
      >
        ▶
      </button>

      <div
        className="size-9 rounded-md flex items-center justify-center mb-2 select-none mt-12"
        title="maxxers"
      >
        <span className="font-sans font-bold text-lg tracking-tight text-text">m</span>
      </div>

      <div className="w-8 h-px bg-border my-1" />

      <nav className="flex flex-col gap-1.5 mt-1 flex-1">
        {PRODUCTS.map((p) => (
          <ProductIcon key={p.id} product={p} isActive={p.id === activeId} />
        ))}
      </nav>
    </aside>
  )
}

function ProductIcon({
  product,
  isActive,
}: {
  product: MaxxerProduct
  isActive: boolean
}) {
  const { label, monogram, accent, route, external, available } = product

  const baseClass =
    'size-10 rounded-md flex items-center justify-center font-sans font-semibold text-xs tracking-tight transition relative'

  let stateClass = ''
  let style: React.CSSProperties = {}

  if (isActive) {
    stateClass = 'text-bg-base'
    style = { backgroundColor: accent, boxShadow: `0 0 18px ${accent}55` }
  } else if (available) {
    stateClass = 'border border-border bg-bg-card text-text-muted hover:text-text'
  } else {
    stateClass = 'border border-border bg-bg-card text-text-subtle opacity-60'
  }

  const tooltip = available ? label : `${label} · coming soon`

  const inner = (
    <span
      className={`${baseClass} ${stateClass}`}
      style={style}
      title={tooltip}
      aria-label={tooltip}
      onMouseEnter={(e) => {
        if (!isActive && available) {
          ;(e.currentTarget as HTMLElement).style.boxShadow = `0 0 14px ${accent}33`
          ;(e.currentTarget as HTMLElement).style.borderColor = `${accent}66`
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive && available) {
          ;(e.currentTarget as HTMLElement).style.boxShadow = ''
          ;(e.currentTarget as HTMLElement).style.borderColor = ''
        }
      }}
    >
      {monogram}
    </span>
  )

  if (!available) return <div>{inner}</div>
  if (external) {
    return (
      <a href={route} className="block focus:outline-none focus:ring-2 focus:ring-accent rounded-md">
        {inner}
      </a>
    )
  }
  return (
    <Link to={route} className="block focus:outline-none focus:ring-2 focus:ring-accent rounded-md">
      {inner}
    </Link>
  )
}

function resolveActiveProductId(pathname: string): string {
  // We're inside the optimizationmaxxing app — every internal route belongs to it.
  if (
    pathname === '/' ||
    pathname.startsWith('/tweaks') ||
    pathname.startsWith('/presets') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/toolkit') ||
    pathname.startsWith('/changelog') ||
    pathname.startsWith('/diagnostics')
  ) {
    return 'opt'
  }
  return ''
}
