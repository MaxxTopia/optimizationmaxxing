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
  // ── Asta Mode ───────────────────────────────────────────────────────
  // The ceiling. Every aggressive software lever this app reaches in one
  // bundle. VIP-only, Fortnite-leaning. ~70% of the gap between a stock
  // budget rig and a $5K rig is software — this closes it.
  // Visual treatment: Black Clover anti-magic. See AstaCard.tsx + /asta.
  {
    id: 'preset.asta-mode',
    name: 'Asta Mode',
    archetype: 'Asta',
    glyph: '🗡',
    tagline: 'Push the rig to its limit · ~12-22 ms off click-to-pixel',
    description:
      "For the kids on stock rigs born to chase pros they shouldn't be able to catch. Combines every aggressive tweak this app ships: HID priority, mitigations off, Hyper-V off, HVCI off, NIC interrupts off, MMCSS GPU bias maxed, IFEO priority for FN/Val/CS2, kernel timer at 0.5ms, MSI mode on display+net+audio, expanded service kills, telemetry/ads hosts blocked, Fortnite Engine.ini + GameUserSettings.ini hand-tunes, HAGS on. Apply once, revert any tweak via Restore Point. The 'unpolite' Tournament FPS preset.",
    tweakIds: [
      // Core latency
      'ui.mouse.disable-acceleration',
      'ui.gamedvr.disable',
      'ui.gamedvr.appcapture.disable',
      'ui.fse.disable-global',
      'ui.visualfx.best-performance',
      'process.priority-separation.foreground',
      'process.system.responsiveness',
      'process.mmcss.games-gpu-priority',
      // HID realtime
      'hid.mouse.priority-realtime',
      'hid.mouse.queue-size.optimize',
      'hid.keyboard.priority-realtime',
      'hid.keyboard.queue-size.optimize',
      // Per-game IFEO priority
      'process.fortnite.priority-high',
      'process.valorant.priority-high',
      'process.cs2.priority-high',
      // Mitigations / VBS / Hyper-V — DANGER tier
      'process.cpu-mitigations.disable-DANGER',
      'bcd.hypervisorlaunchtype.off',
      'vbs.hvci.disable',
      // Power
      'process.power-throttling.disable',
      'process.core-parking.disable',
      'power.pcie.link-state.off',
      'power.usb3.link-power.disable',
      'process.usb-power-mgmt.disable',
      'process.hid-power-mgmt.disable',
      // Network
      'net.throttling.disable',
      'net.nic.interrupt-moderation.disable',
      'net.nic.flow-control.disable',
      'net.nic.rss.enable',
      'net.nic.rsc.disable',
      'net.nic.checksum-offload.disable',
      'net.nic.lso.disable',
      // GPU + display
      'process.hags.enable',
      'monitor.mpo.disable',
      'monitor.windowed-game-opt.disable',
      'process.msi-mode.gpu-nic-audio',
      // Boot + kernel
      'bcd.disabledynamictick.yes',
      'bcd.tscsyncpolicy.enhanced',
      // Memory
      'ps.mmagent.disable-mc',
      'ps.mmagent.disable-pagecombining',
      // Background noise
      'tasks.telemetry-batch.disable',
      'service.werservice.disable',
      'service.maps-broker.disable',
      'service.geolocation.disable',
      'process.windows-search.disable',
      'process.sysmain.disable',
      'hosts.block.ms-telemetry',
      'hosts.block.windows-ads',
      // Fortnite-specific config FileWrite (added in v0.1.48)
      'fortnite.engine-ini.optimize',
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

/** Find a preset by id (handles both 'preset.X' and 'X' for community packs). */
export function presetById(id: string): PresetBundle | undefined {
  return PRESETS.find((p) => p.id === id || p.id === `preset.${id}`)
}
