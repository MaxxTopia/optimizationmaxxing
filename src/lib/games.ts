/**
 * Centralized game registry. Single source of truth for:
 *   - Tweaks page per-game filter chips
 *   - Game Session page profiles (Suspend-Process targets + keep-list)
 *   - Curated guides per-game callouts
 *   - Tournament-compliance mapping (Phase 4)
 *
 * Adding a new game: append an entry here. Tweaks.tsx + Guides.tsx + Session.tsx
 * all read from this list.
 */

export type GameId =
  | 'fortnite'
  | 'valorant'
  | 'cs2'
  | 'apex'
  | 'warzone'
  | 'osu'
  | 'overwatch'
  | 'marvel-rivals'

export type Anticheat = 'eac' | 'vanguard' | 'battleye' | 'vac' | 'nexus' | 'none'

export interface Game {
  id: GameId
  label: string
  glyph: string
  anticheat: Anticheat
  /**
   * Process names (lowercase) we DON'T suspend when this game is selected
   * in the Game Session page — the game depends on them being alive.
   */
  keepNames: string[]
  /**
   * Default Suspend-by-category mask shown in Session page.
   */
  defaultSuspend: {
    launcher: boolean
    voice: boolean
    music: boolean
    overlay: boolean
  }
}

export const GAMES: Game[] = [
  {
    id: 'fortnite',
    label: 'Fortnite',
    glyph: '🎯',
    anticheat: 'eac',
    keepNames: ['epicgameslauncher.exe', 'epicwebhelper.exe', 'fortniteclient-win64-shipping.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'valorant',
    label: 'Valorant',
    glyph: '🔫',
    anticheat: 'vanguard',
    // RiotClient + Vanguard MUST stay alive
    keepNames: [
      'riotclientservices.exe',
      'riotclientux.exe',
      'riotclientuxrender.exe',
      'valorant.exe',
      'valorant-win64-shipping.exe',
      'vgc.exe',
      'vgtray.exe',
    ],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'cs2',
    label: 'CS2',
    glyph: '⚡',
    anticheat: 'vac',
    keepNames: ['steam.exe', 'steamwebhelper.exe', 'cs2.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'apex',
    label: 'Apex Legends',
    glyph: '⛰',
    anticheat: 'eac',
    keepNames: ['easyanticheat.exe', 'r5apex.exe', 'easyanticheat_eos.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'warzone',
    label: 'Warzone',
    glyph: '🪂',
    anticheat: 'battleye',
    keepNames: ['cod.exe', 'modernwarfare.exe', 'beservice.exe', 'beclient.dll'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'osu',
    label: 'osu!',
    glyph: '🎵',
    anticheat: 'none',
    keepNames: ['osu!.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'overwatch',
    label: 'Overwatch 2',
    glyph: '🛡',
    anticheat: 'battleye',
    keepNames: ['battle.net.exe', 'agent.exe', 'overwatch.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'marvel-rivals',
    label: 'Marvel Rivals',
    glyph: '🦸',
    anticheat: 'nexus',
    keepNames: ['marvel-win64-shipping.exe', 'marvelrivals_launcher.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
]

export function getGame(id: GameId): Game | undefined {
  return GAMES.find((g) => g.id === id)
}

/** Compact label for chip rendering, e.g. "🎯 Fortnite". */
export function gameChip(g: Game): string {
  return `${g.glyph} ${g.label}`
}
