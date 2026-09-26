/**
 * Curated preset bundles. Each picks ids from the v1 catalog into a
 * pre-baked workflow. Phase 6 ships static presets; Phase 9 lets users
 * save custom presets + share via export/import.
 */
import type { TweakRecord } from './catalog'
import { catalog, isExperimentalTweak } from './catalog'

export interface PresetBundle {
  id: string
  name: string
  tagline: string
  description: string
  /** IDs from v1 catalog. The UI reports missing IDs instead of hiding them. */
  tweakIds: string[]
  /** "Esports" / "BR" / "Streamer" — surfaces in the badge. */
  archetype: string
  /** vipGate of the bundle as a whole (any VIP tweak inside escalates the bundle). */
  vipGate: 'free' | 'vip'
  /** Optional unicode glyph for visual recognition. */
  glyph?: string
}

export const PRESETS: PresetBundle[] = [
  {
    id: 'preset.esports',
    name: 'Esports',
    archetype: 'Esports',
    glyph: '⚡',
    tagline: 'Latency-focused · ranked matches',
    description:
      'A measured-core bundle for ranked play: max refresh rate, the named Ultimate Performance desktop plan, mouse acceleration off, Game Mode on, Game DVR off, and sticky-keys protection. Device interrupts, boot flags, security changes, and other experiments stay out of this default lane.',
    tweakIds: [
      'display.refresh.maximize',
      'ps.power.dt-tournament',
      'ui.mouse.disable-acceleration',
      'ui.gamemode.enable',
      'ui.gamedvr.disable',
      'ui.sticky-keys.disable',
    ],
    vipGate: 'free',
  },
  {
    id: 'preset.br',
    name: 'Battle Royale',
    archetype: 'BR',
    glyph: '🎯',
    tagline: 'Max FPS · stable 1% lows · endgame stability',
    description:
      'Frees the resources that actually spike in endgame storms: RGB-software DPC/RAM tax reduced, Game DVR off, and the game pinned to High priority. Windows Search remains opt-in because selective indexing is safer than disabling it globally. v1.9.0: dropped MMCSS GPU-priority + visual-fx + SystemResponsiveness — efficacy audit found these don\'t reach the game (folklore / desktop-only).',
    tweakIds: [
      'ui.gamedvr.disable',
      'peripherals.rgb-control-apps.autostart-disable',
      'process.fortnite.priority-high',
    ],
    vipGate: 'vip',
  },
  {
    id: 'preset.streamer',
    name: 'Streamer',
    archetype: 'Streamer',
    glyph: '🎬',
    tagline: 'Stutter-free recording · OBS-friendly',
    description:
      'Removes Game DVR conflict, disables fullscreen-exclusive (so capture works), removes startup delay. Pairs well with NVENC encoder presets.',
    tweakIds: [
      'ui.gamedvr.disable',
      'ui.fse.disable-global',
      'ui.startup.delay-disable',
      'ui.menu-show-delay.zero',
    ],
    vipGate: 'free',
  },
  {
    id: 'preset.frame-pacing',
    name: 'Frame Pacing',
    archetype: 'Pro Timing',
    glyph: '⏱',
    tagline: 'TSC-only · zero hypervisor · stable kernel timer',
    description:
      'Boot-store overhaul that disables Hyper-V at boot and syncs the TSC across cores. Audited 2026-05-07: dropped useplatformtick + clockres (folklore — not documented BCD elements; kernel ignores). v0.2.6: dropped disabledynamictick — Microsoft debug-only flag tied to Win11 mouse-input desync. v0.2.12: dropped hpet.disable + useplatformclock.disable — modern Windows already runs invariant TSC by default; disabling HPET risks TSC drift (anti-cheat speedhack flag) for no measured gain.',
    tweakIds: [
      'bcd.tscsyncpolicy.enhanced',
      'bcd.hypervisorlaunchtype.off',
      'process.global-timer-resolution.allow',
    ],
    vipGate: 'vip',
  },
  {
    id: 'preset.network-low-latency',
    name: 'Network Low-Latency',
    archetype: 'Network',
    glyph: '🌐',
    tagline: 'NIC-level interrupt + RSS · throttle + telemetry off',
    description:
      'Rebuilt around tweaks with a real in-match mechanism. EEE/green-ethernet power-save off (the one tweak that fixes real PHY wake micro-stalls on a thin UDP flow), NIC interrupt-moderation off (immediate RX IRQ), RSS on, telemetry/ad hosts blocked. v1.9.0: dropped flow-control (only fires on link saturation) — efficacy audit. Honest: ping/jitter are ISP/route-dominated; this removes local failure modes, it can\'t lower your base ping.',
    tweakIds: [
      'net.nic.eee-powersave.disable',
      'net.nic.interrupt-moderation.disable',
      'net.nic.rss.enable',
      'hosts.block.ms-telemetry',
      'hosts.block.windows-ads',
    ],
    vipGate: 'vip',
  },
  // ── Asta Mode ───────────────────────────────────────────────────────
  // The ceiling. Asta is intentionally the full catalog inventory; the page
  // performs the rig/game/manual-firmware filter at apply time. It is a lab
  // preset, not a promise that every row is safe or useful on every PC.
  // Visual treatment: Black Clover anti-magic. See AstaCard.tsx + /asta.
  {
    id: 'preset.asta-mode',
    name: 'Asta Mode',
    archetype: 'Asta',
    glyph: '🗡',
    tagline: 'Full applicable catalog · explicit risk gates · measure every change',
    description:
      "The full applicable catalog for the detected rig and selected game context. Asta separates transactional changes from explicit script review, skips BIOS/NVRAM/firmware writes, and never claims that a command exit code proves persistence or competitive gain.",
    tweakIds: catalog.tweaks.map((tweak) => tweak.id),
    vipGate: 'vip',
  },
]

export function presetTweaks(p: PresetBundle): TweakRecord[] {
  const byId = new Map(catalog.tweaks.map((t) => [t.id, t]))
  return p.tweakIds
    .map((id) => byId.get(id))
    .filter((t): t is TweakRecord => !!t)
}

export function presetMissingTweakIds(p: PresetBundle): string[] {
  const ids = new Set(catalog.tweaks.map((t) => t.id))
  return p.tweakIds.filter((id) => !ids.has(id))
}

export function presetExperimentalTweaks(p: PresetBundle): TweakRecord[] {
  return presetTweaks(p).filter(isExperimentalTweak)
}

/** Find a preset by id (handles both 'preset.X' and 'X' for community packs). */
export function presetById(id: string): PresetBundle | undefined {
  return PRESETS.find((p) => p.id === id || p.id === `preset.${id}`)
}
