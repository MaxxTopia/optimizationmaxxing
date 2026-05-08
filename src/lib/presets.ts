/**
 * Curated preset bundles. Each picks ids from the v1 catalog into a
 * pre-baked workflow. Phase 6 ships static presets; Phase 9 lets users
 * save custom presets + share via export/import.
 */
import type { TweakRecord } from './catalog'
import { catalog } from './catalog'

export interface PresetBundle {
  id: string
  name: string
  tagline: string
  description: string
  /** IDs from v1 catalog. Bad IDs are filtered silently. */
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
    tagline: 'Lowest input lag · ranked matches',
    description:
      'Strips DWM compositor lag, maxes scheduler bias to your focused game, removes mouse acceleration. Proven on competitive Val, CS2, Apex.',
    tweakIds: [
      'ui.gamedvr.disable',
      'ui.fse.disable-global',
      'ui.mouse.disable-acceleration',
      'process.system.responsiveness',
      'process.priority-separation.foreground',
    ],
    vipGate: 'vip',
  },
  {
    id: 'preset.br',
    name: 'Battle Royale',
    archetype: 'BR',
    glyph: '🎯',
    tagline: 'Max FPS · stable 1% lows · endgame stability',
    description:
      'Network throttle off, MMCSS GPU priority maxed, visual effects stripped. Tuned for Fortnite endgame storms and Warzone final circles.',
    tweakIds: [
      'ui.gamedvr.disable',
      'ui.visualfx.best-performance',
      'net.throttling.disable',
      'process.mmcss.games-gpu-priority',
      'process.system.responsiveness',
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
      'Boot-store overhaul that forces Windows onto the TSC, disables Hyper-V at boot, and locks the kernel timer to a constant rate. Audited 2026-05-07: dropped useplatformtick + clockres (folklore — not documented BCD elements; kernel ignores).',
    tweakIds: [
      'process.hpet.disable',
      'bcd.useplatformclock.disable',
      'bcd.disabledynamictick.yes',
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
      'Rebuilt 2026-05-07 around tweaks that actually move the needle on Win10/11 (Microsoft autotuning made the old TCP-stack tweaks no-ops). NIC interrupt-moderation off, flow control off, RSS enabled, NetworkThrottlingIndex max, MS telemetry + Windows ad endpoints blocked at hosts.',
    tweakIds: [
      'net.throttling.disable',
      'net.nic.interrupt-moderation.disable',
      'net.nic.flow-control.disable',
      'net.nic.rss.enable',
      'hosts.block.ms-telemetry',
      'hosts.block.windows-ads',
    ],
    vipGate: 'vip',
  },
]

export function presetTweaks(p: PresetBundle): TweakRecord[] {
  const byId = new Map(catalog.tweaks.map((t) => [t.id, t]))
  return p.tweakIds
    .map((id) => byId.get(id))
    .filter((t): t is TweakRecord => !!t)
}
