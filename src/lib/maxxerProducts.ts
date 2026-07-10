/**
 * Maxxer suite product list — single source of truth for the left rail.
 * Ported from maxxtopia/src/data/products.ts. Trimmed: we keep only the
 * sidebar-relevant fields (slug, name, status, accentHex, logo) — the
 * full marketing copy + release feeds live on maxxtopia and aren't
 * needed here.
 *
 * Keep this in sync with maxxtopia. When discordmaxxer's logo updates,
 * re-copy public/logos/discordmaxxer-icon.png from the maxxtopia repo.
 */

export type ProductStatus = 'live' | 'beta' | 'waitlist' | 'soon' | 'dev'

export interface MaxxerProduct {
  slug: string
  name: string
  status: ProductStatus
  accentHex: string
  logo?: string
  /** External live URL — used when this product has its own deployed site
   * outside maxxtopia and we want to deep-link there. Optional. */
  deployedUrl?: string
}

export const MAXXER_PRODUCTS: MaxxerProduct[] = [
  // Mirrors maxxtopia.com's sidebar rail — same top-to-bottom RAIL_ORDER, same
  // status + accent + icon (the site's `icon ?? logo`) so the app and site read
  // as one family. optimizationmaxxing + discordmaxxer keep their original OG
  // app marks — do NOT swap those two for the website's rail icons.
  // Re-copy the icon from maxxtopia/public/logos when a mark changes upstream.
  { slug: 'extensionmaxxing',    name: 'AdBlock-Maxxer',      status: 'live', accentHex: '#00d4ff', logo: '/logos/adblockmaxxer.png' },
  { slug: 'discordmaxxer',       name: 'Discordmaxxer',       status: 'live', accentHex: '#5865F2', logo: '/logos/discordmaxxer-icon.png' },
  { slug: 'optimizationmaxxing', name: 'Optimizationmaxxing', status: 'live', accentHex: '#e25bff', logo: '/logos/optimizationmaxxing.svg' },
  { slug: 'streammaxxing',       name: 'Streammaxxing',       status: 'live', accentHex: '#22d3a0', logo: '/logos/streammaxxing-icon.png' },
  { slug: 'viewmaxxing',         name: 'Viewmaxxing',         status: 'beta', accentHex: '#10b981', logo: '/logos/viewmaxxing-icon.png' },
  { slug: 'clipmaxxer',          name: 'Clipmaxxer',          status: 'beta', accentHex: '#00d4ff', logo: '/logos/clipmaxxer-icon.svg' },
  { slug: 'snipemaxxer',         name: 'Snipemaxxer',         status: 'beta', accentHex: '#ff3b3b', logo: '/logos/snipemaxxer.svg' },
  { slug: 'playlistmaxxing',     name: 'Playlistmaxxing',     status: 'live', accentHex: '#ff2e88', logo: '/logos/playlistmaxxing.webp' },
  { slug: 'dropmaxxer',          name: 'Dropmaxxer',          status: 'beta', accentHex: '#4c51f7', logo: '/logos/dropmaxxer-icon.svg' },
  { slug: 'aimmaxxer',           name: 'Aimmaxxer',           status: 'soon', accentHex: '#f3af19', logo: '/logos/aimmaxxer-icon.png' },
]

/** Two-letter monogram from product name (e.g., "Optimizationmaxxing" → "OM"). */
export function monogram(name: string): string {
  const root = name.replace(/maxx(er|ing)$/i, '')
  return (root[0] + 'M').toUpperCase()
}

export function statusLabel(status: ProductStatus): string {
  switch (status) {
    case 'live':
      return 'Live'
    case 'beta':
      return 'Beta'
    case 'waitlist':
      return 'Waitlist'
    case 'soon':
      return 'Coming soon'
    case 'dev':
      return 'In development'
  }
}
