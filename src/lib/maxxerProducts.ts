/**
 * Maxxer suite product list — single source of truth for the left rail.
 * Ported from maxxtopia/src/data/products.ts. Trimmed: we keep only the
 * sidebar-relevant fields (slug, name, status, accentHex, logo) — the
 * full marketing copy + release feeds live on maxxtopia and aren't
 * needed here.
 *
 * Keep this in sync with maxxtopia. When discordmaxxer's logo updates,
 * re-copy public/logos/discordmaxxer.svg from the maxxtopia repo.
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
  { slug: 'optimizationmaxxing', name: 'Optimizationmaxxing', status: 'live', accentHex: '#e25bff', logo: '/logos/optimizationmaxxing.svg' },
  { slug: 'discordmaxxer',       name: 'Discordmaxxer',       status: 'live', accentHex: '#5865F2', logo: '/logos/discordmaxxer.svg' },
  { slug: 'clipmaxxer',          name: 'Clipmaxxer',          status: 'soon', accentHex: '#00d4ff' },
  { slug: 'dropmaxxer',          name: 'Dropmaxxer',          status: 'beta', accentHex: '#4c51f7' },
  { slug: 'aimmaxxer',           name: 'Aimmaxxer',           status: 'soon', accentHex: '#f3af19' },
  { slug: 'viewmaxxing',         name: 'Viewmaxxing',         status: 'soon', accentHex: '#10b981' },
  { slug: 'editmaxxing',         name: 'Editmaxxing',         status: 'soon', accentHex: '#ff6b8b' },
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
