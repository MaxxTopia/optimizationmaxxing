/**
 * Four named profile themes. Each is a complete colorway + typography
 * swap, applied by ProfileProvider via CSS custom properties on :root
 * plus a `profile-<id>` body class for component-level overrides.
 *
 * Inspired by aimmaxxer's profile-config pattern (per-game named snapshots)
 * but expressed visually rather than functionally.
 */

export type ProfileId = 'val' | 'sonic' | 'dmc' | 'bo3'

export interface ProfileTheme {
  id: ProfileId
  label: string
  /** One-line vibe description for the picker tooltip. */
  blurb: string
  /** CSS variables written to :root when this profile is active. */
  vars: Record<string, string>
  /** Optional <body> class to enable per-theme component overrides. */
  bodyClass: string
  /** Thumbnail color hint for the picker. */
  swatch: { primary: string; secondary: string; bg: string }
}

const FONT_INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

export const profiles: Record<ProfileId, ProfileTheme> = {
  val: {
    id: 'val',
    label: 'Val',
    blurb: 'Tactical. Red + cream. Inspired by Valorant.',
    bodyClass: 'profile-val',
    swatch: { primary: '#ff4655', secondary: '#0f1923', bg: '#0d1418' },
    vars: {
      '--bg-base': '#0d1418',
      '--bg-raised': '#16252c',
      '--bg-card': 'rgba(45, 76, 87, 0.45)',
      '--accent': '#ff4655',
      '--accent-soft': '#ff7a87',
      '--accent-dark': '#b3303c',
      '--secondary': '#0f1923',
      '--secondary-dark': '#08111a',
      '--text': '#ece8e1',
      '--text-muted': '#c8b89a',
      '--text-subtle': '#8e8579',
      '--border': 'rgba(255, 70, 85, 0.18)',
      '--border-glow': 'rgba(255, 70, 85, 0.4)',
      '--font-body': FONT_INTER,
      '--font-heading': FONT_INTER,
    },
  },
  sonic: {
    id: 'sonic',
    label: 'Sonic',
    blurb: 'Speed. Cobalt + gold. Bright and kinetic.',
    bodyClass: 'profile-sonic',
    swatch: { primary: '#ffd700', secondary: '#007aff', bg: '#051e3e' },
    vars: {
      '--bg-base': '#051e3e',
      '--bg-raised': '#0a3a73',
      '--bg-card': 'rgba(20, 80, 160, 0.4)',
      '--accent': '#ffd700',
      '--accent-soft': '#ffea66',
      '--accent-dark': '#cca400',
      '--secondary': '#007aff',
      '--secondary-dark': '#0055cc',
      '--text': '#ffffff',
      '--text-muted': '#c5d6f0',
      '--text-subtle': '#7e9ec8',
      '--border': 'rgba(255, 215, 0, 0.22)',
      '--border-glow': 'rgba(255, 215, 0, 0.5)',
      '--font-body': FONT_INTER,
      '--font-heading': FONT_INTER,
    },
  },
  dmc: {
    id: 'dmc',
    label: 'DMC',
    blurb: 'Gothic. Blood red + bone + obsidian. Devil May Cry energy.',
    bodyClass: 'profile-dmc',
    swatch: { primary: '#b3000c', secondary: '#6b2737', bg: '#0a0506' },
    vars: {
      '--bg-base': '#0a0506',
      '--bg-raised': '#1a0e10',
      '--bg-card': 'rgba(60, 12, 18, 0.5)',
      '--accent': '#b3000c',
      '--accent-soft': '#e63946',
      '--accent-dark': '#7a0008',
      '--secondary': '#6b2737',
      '--secondary-dark': '#42171f',
      '--text': '#f4ecd8',
      '--text-muted': '#c4b89a',
      '--text-subtle': '#8a7c66',
      '--border': 'rgba(179, 0, 12, 0.22)',
      '--border-glow': 'rgba(179, 0, 12, 0.55)',
      '--font-body': FONT_INTER,
      '--font-heading': "'Cormorant Garamond', Georgia, serif",
    },
  },
  bo3: {
    id: 'bo3',
    label: 'Black Ops 3',
    blurb: 'Military / cyber. Olive + neon orange + matte black.',
    bodyClass: 'profile-bo3',
    swatch: { primary: '#ff6b1a', secondary: '#5a6840', bg: '#0e0f0a' },
    vars: {
      '--bg-base': '#0e0f0a',
      '--bg-raised': '#1c1d15',
      '--bg-card': 'rgba(50, 56, 35, 0.45)',
      '--accent': '#ff6b1a',
      '--accent-soft': '#ffa14d',
      '--accent-dark': '#b34a0e',
      '--secondary': '#5a6840',
      '--secondary-dark': '#3a4329',
      '--text': '#e9e8df',
      '--text-muted': '#b3b09e',
      '--text-subtle': '#7e7c6c',
      '--border': 'rgba(255, 107, 26, 0.22)',
      '--border-glow': 'rgba(255, 107, 26, 0.5)',
      '--font-body': FONT_INTER,
      '--font-heading': FONT_INTER,
    },
  },
}

export const DEFAULT_PROFILE: ProfileId = 'val'
export const PROFILE_ORDER: ProfileId[] = ['val', 'sonic', 'dmc', 'bo3']
