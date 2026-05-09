/**
 * Five named profile themes. Each is a complete colorway + typography
 * swap, applied by ProfileProvider via CSS custom properties on :root
 * plus a `profile-<id>` body class for component-level overrides.
 *
 * Inspired by aimmaxxer's profile-config pattern (per-game named snapshots)
 * but expressed visually rather than functionally.
 */

export type ProfileId = 'val' | 'sonic' | 'dmc' | 'bo3' | 'akatsuki'

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
const FONT_DMC = "'Cormorant Garamond', Georgia, serif"
const FONT_ZOMBIES = "'Pirata One', 'Cinzel', 'Cormorant Garamond', Georgia, serif"
const FONT_AKATSUKI = "'Cinzel', 'Cormorant Garamond', Georgia, serif"

export const profiles: Record<ProfileId, ProfileTheme> = {
  val: {
    id: 'val',
    label: 'Val',
    blurb: 'Tactical. Desaturated red + cool slate. Valorant menu energy.',
    bodyClass: 'profile-val',
    // Polished palette: drop a bit of saturation off the candy red, deepen
    // the base, sharpen the borders, and tighten the card opacity so the
    // surface reads tactical instead of plastic.
    swatch: { primary: '#e23947', secondary: '#0f1923', bg: '#0c1217' },
    vars: {
      '--bg-base': '#0c1217',
      '--bg-raised': '#16242b',
      '--bg-card': 'rgba(45, 76, 87, 0.35)',
      '--accent': '#e23947',
      '--accent-soft': '#ff5a6a',
      '--accent-dark': '#a52938',
      '--secondary': '#0f1923',
      '--secondary-dark': '#08111a',
      '--text': '#ece8e1',
      '--text-muted': '#c8b89a',
      '--text-subtle': '#8e8579',
      '--border': 'rgba(226, 57, 71, 0.22)',
      '--border-glow': 'rgba(226, 57, 71, 0.5)',
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
      '--font-heading': FONT_DMC,
    },
  },
  bo3: {
    id: 'bo3',
    label: 'BO3 Zombies',
    // Treyarch's Zombies design language — Pack-a-Punch gold over Origins
    // crypt black, blood maroon walls, parchment text, eldritch Apothicon
    // purple as a rare accent. The original BO3 multiplayer orange/olive
    // never matched the dread the Zombies designers actually built.
    blurb: 'Eldritch. Pack-a-Punch gold + blood maroon + parchment + Apothicon purple.',
    bodyClass: 'profile-bo3',
    swatch: { primary: '#d4af37', secondary: '#5b1a1a', bg: '#080404' },
    vars: {
      '--bg-base': '#080404',
      '--bg-raised': '#160a0a',
      '--bg-card': 'rgba(60, 16, 16, 0.5)',
      '--accent': '#d4af37',
      '--accent-soft': '#f0c75e',
      '--accent-dark': '#8a6d1f',
      '--accent-eldritch': '#5b2d8a',
      '--secondary': '#5b1a1a',
      '--secondary-dark': '#3a0f0f',
      '--text': '#e8d9b0',
      '--text-muted': '#bda87a',
      '--text-subtle': '#8a7a52',
      '--border': 'rgba(212, 175, 55, 0.22)',
      '--border-glow': 'rgba(212, 175, 55, 0.55)',
      '--font-body': FONT_INTER,
      '--font-heading': FONT_ZOMBIES,
    },
  },
  akatsuki: {
    id: 'akatsuki',
    label: 'Akatsuki',
    // Black robe + scarlet cloud + Sharingan gold ring. Crimson outlives
    // every other "competitive red" theme on contrast alone.
    blurb: 'Cloud-red on void. Scarlet clouds, Sharingan gold accents.',
    bodyClass: 'profile-akatsuki',
    swatch: { primary: '#c91f37', secondary: '#d4af37', bg: '#0a0606' },
    vars: {
      '--bg-base': '#0a0606',
      '--bg-raised': '#14080a',
      '--bg-card': 'rgba(40, 8, 12, 0.5)',
      '--accent': '#c91f37',
      '--accent-soft': '#e45669',
      '--accent-dark': '#7a0a1a',
      '--secondary': '#d4af37',
      '--secondary-dark': '#9a7a1f',
      '--text': '#f0e4d8',
      '--text-muted': '#b9a487',
      '--text-subtle': '#7e6b54',
      '--border': 'rgba(201, 31, 55, 0.22)',
      '--border-glow': 'rgba(201, 31, 55, 0.55)',
      '--font-body': FONT_INTER,
      '--font-heading': FONT_AKATSUKI,
    },
  },
}

export const DEFAULT_PROFILE: ProfileId = 'val'
export const PROFILE_ORDER: ProfileId[] = ['val', 'sonic', 'dmc', 'bo3', 'akatsuki']
