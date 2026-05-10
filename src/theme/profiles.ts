/**
 * Six named profile themes. Each is a complete colorway + typography
 * swap, applied by ProfileProvider via CSS custom properties on :root
 * plus a `profile-<id>` body class for component-level overrides.
 *
 * Migration note (v0.1.59): the previous `bo3` theme was renamed to
 * `bumblebee` (its gold-yellow palette never matched what BO3 *Zombies*
 * actually looked like — Pack-a-Punch gold IS bumblebee yellow + black
 * accents). The NEW `element-115` theme is the proper Zombies treatment,
 * inspired by Buried + Origins + the wonder-weapon arsenal: Element 115
 * cyan as primary glow, Pack-a-Punch violet as secondary, candle-gold
 * accents from Buried's western town, runic etch + electric arc as
 * signature flourishes (see index.css). The profileStore migrates
 * any localStorage value of `bo3` to `bumblebee` on next load.
 *
 * Akatsuki was repaletted (v0.1.59): dropped the gold secondary
 * (Sharingan-inspired but visually wrong for the org — Akatsuki canon
 * is black cloak + scarlet cloud + purple nail-polish nod). Now uses
 * crimson + Itachi-purple, with a low-alpha cloud-pattern background.
 */

export type ProfileId = 'val' | 'sonic' | 'dmc' | 'bumblebee' | 'element-115' | 'akatsuki'

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
  bumblebee: {
    id: 'bumblebee',
    label: 'Bumblebee',
    // The old `bo3` theme renamed for accuracy — this palette is
    // Pack-a-Punch gold + blood maroon + parchment, which is bumblebee
    // yellow-on-black at its core. Kept the same colorway because users
    // liked it; just calling it what it is. The actual Zombies treatment
    // moved to the new `element-115` profile.
    blurb: 'Pack-a-Punch gold on black, parchment text. Bold and warm.',
    bodyClass: 'profile-bumblebee',
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
  'element-115': {
    id: 'element-115',
    label: 'Element 115',
    // Black Ops 3 Zombies — proper. Element 115 (the substance that
    // animates the dead) reads as electric cyan in BO3-era canon
    // (Origins / Der Eisendrache). Pack-a-Punch chamber violet as
    // secondary. Buried's candle-warm gold for tertiary detail.
    // Background: near-black with violet undertone to feel like a
    // cracked-open PaP chamber. Signature flourishes (runic etch on
    // hover, electric arc on focus, candle-flicker on CTAs) live in
    // index.css under .profile-element-115.
    blurb: 'Element 115 cyan + Pack-a-Punch violet + Buried candle-gold.',
    bodyClass: 'profile-element-115',
    swatch: { primary: '#3DDFE8', secondary: '#9D4DFF', bg: '#0F0A1A' },
    vars: {
      '--bg-base': '#0F0A1A',
      '--bg-raised': '#1C1530',
      '--bg-card': 'rgba(43, 27, 92, 0.45)',
      '--accent': '#3DDFE8',
      '--accent-soft': '#7FECF0',
      '--accent-dark': '#1FA9B0',
      '--accent-eldritch': '#9D4DFF',
      '--secondary': '#9D4DFF',
      '--secondary-dark': '#5C2A99',
      '--text': '#D9C9A3',
      '--text-muted': '#B0A085',
      '--text-subtle': '#7A6E5A',
      '--border': 'rgba(61, 223, 232, 0.25)',
      '--border-glow': 'rgba(61, 223, 232, 0.6)',
      '--font-body': FONT_INTER,
      '--font-heading': FONT_ZOMBIES,
    },
  },
  akatsuki: {
    id: 'akatsuki',
    label: 'Akatsuki',
    // Reworked v0.1.59 — dropped Sharingan gold (visually wrong for the
    // org). Akatsuki canonical: black cloak + scarlet cloud (red rain /
    // blood rain symbolism) + Itachi-purple nail-polish nod. Background
    // gets a low-alpha repeating cloud pattern (see index.css under
    // .profile-akatsuki). "Akatsuki" literally means Daybreak —
    // ironic given the org's dark nature, but a hook for marketing copy.
    blurb: '"Daybreak". Black + crimson clouds + Itachi-purple. Antagonist-elegant.',
    bodyClass: 'profile-akatsuki',
    swatch: { primary: '#B71C1C', secondary: '#4A2C4A', bg: '#0A0A0A' },
    vars: {
      '--bg-base': '#0A0A0A',
      '--bg-raised': '#161013',
      '--bg-card': 'rgba(40, 12, 18, 0.55)',
      '--accent': '#B71C1C',
      '--accent-soft': '#E63946',
      '--accent-dark': '#7A0A12',
      '--secondary': '#4A2C4A',
      '--secondary-dark': '#2A1828',
      '--text': '#E8DED3',
      '--text-muted': '#9F8E7E',
      '--text-subtle': '#6B5C4F',
      '--border': 'rgba(183, 28, 28, 0.25)',
      '--border-glow': 'rgba(183, 28, 28, 0.6)',
      '--font-body': FONT_INTER,
      '--font-heading': FONT_AKATSUKI,
    },
  },
}

export const DEFAULT_PROFILE: ProfileId = 'val'
export const PROFILE_ORDER: ProfileId[] = ['val', 'sonic', 'dmc', 'bumblebee', 'element-115', 'akatsuki']
