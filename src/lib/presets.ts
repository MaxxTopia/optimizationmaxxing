/**
 * Curated preset bundles. Each picks ids from the v1 catalog into a
 * pre-baked workflow. Phase 6 ships static presets; Phase 9 lets users
 * save custom presets + share via export/import.
 */
import type { TweakRecord } from './catalog'
import { catalog, isExperimentalTweak, tweakMatchesSpec } from './catalog'
import type { SpecProfile } from './tauri'

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
    id: 'preset.rainbow-six-siege',
    name: 'Rainbow Six Siege',
    archetype: 'Shooter',
    glyph: '🛡️',
    tagline: 'Stable frame times · lower latency · free',
    description:
      'A free, reversible Siege performance pack. One transaction applies the verified Windows, power, USB/HID, background-policy, RGB-autostart, and supported Ethernet baseline for this PC. Laptop-sensitive refresh, HAGS, OEM-control, and Store-app policy changes stay unchanged automatically; the setup card separately gives the exact Siege, NVIDIA, overlay, advanced NIC, thermal, FPS-cap, and frame-pacing values that still belong in their official controls.',
    tweakIds: [
      'display.refresh.maximize',
      'ui.mouse.disable-acceleration',
      'ui.gamemode.enable',
      'ui.gamedvr.disable',
      'ui.gamedvr.appcapture.disable',
      'process.hags.enable',
      'ps.power.dt-tournament',
      'process.power-throttling.disable',
      'process.usb-power-mgmt.disable',
      'process.hid-power-mgmt.disable',
      'process.edge.background-disable',
      'process.background-apps.disable',
      'peripherals.rgb-control-apps.autostart-disable',
      'net.nic.rss.enable',
      'net.nic.eee-powersave.disable',
    ],
    vipGate: 'free',
  },
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
      'The aggressive Fortnite competitive pack: mouse acceleration off, Game Mode and HAGS on, maximum refresh selected, capture and background activity disabled, High process priority at launch, power-throttling removed, RSS enabled, and desktop NIC power-save protection disabled. High is used, never Realtime. Desktop-only settings are skipped on laptops so OEM thermal and battery controls are not destroyed; experimental NIC interrupt/packet-shaping changes remain in the dedicated lab because they can increase latency on the wrong driver or route.',
    tweakIds: [
      'display.refresh.maximize',
      'ui.mouse.disable-acceleration',
      'ui.gamemode.enable',
      'ui.gamedvr.disable',
      'ui.gamedvr.appcapture.disable',
      'process.hags.enable',
      'process.fortnite.priority-high',
      'ps.power.dt-tournament',
      'process.power-throttling.disable',
      'process.background-apps.disable',
      'process.edge.background-disable',
      'net.nic.rss.enable',
      'net.nic.eee-powersave.disable',
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

// Laptop OEM control centers can own fan/boost/MUX/performance mode. These
// settings are still available as deliberate, manual choices elsewhere, but
// the one-click Siege baseline must not change them without a confirmed
// desktop chassis. A refresh-mode change can also introduce a VSync/FPS-cap
// interaction, while HAGS and the background-app policy are driver/OEM
// dependent. Leaving these four alone reduces the chance of a safe preset
// creating a laptop FPS regression after reboot or logon.
const LAPTOP_SIEGE_DEFERRED_IDS = new Set([
  'display.refresh.maximize',
  'process.hags.enable',
  'process.background-apps.disable',
  'peripherals.rgb-control-apps.autostart-disable',
])

// These curated packs contain desktop-only actions. A confirmed laptop keeps
// its OEM power/thermal policy; an unknown chassis is withheld until a rig
// scan can prove that applying it is appropriate.
const RIG_AWARE_PRESET_IDS = new Set(['preset.rainbow-six-siege', 'preset.br'])

export function siegeLaptopDeferredReason(
  tweakId: string,
  formFactor: 'laptop' | 'desktop' | 'unknown',
): string | null {
  if (formFactor === 'desktop' || !LAPTOP_SIEGE_DEFERRED_IDS.has(tweakId)) return null
  switch (tweakId) {
    case 'display.refresh.maximize':
      return 'automatic display-refresh changes are deferred on laptops to avoid changing VSync or an in-game frame cap'
    case 'process.hags.enable':
      return 'HAGS is left unchanged on laptops because driver and game behavior is hardware-dependent'
    case 'process.background-apps.disable':
      return 'the background-app policy is deferred so OEM control-center apps can keep working'
    case 'peripherals.rgb-control-apps.autostart-disable':
      return 'the RGB startup sweep is deferred so OEM fan, boost, MUX, and performance controls can keep working'
    default:
      return 'this setting needs a confirmed desktop chassis before automatic application'
  }
}

export function presetDeferredReason(
  tweak: TweakRecord,
  formFactor: 'laptop' | 'desktop' | 'unknown',
): string {
  const siegeReason = siegeLaptopDeferredReason(tweak.id, formFactor)
  if (siegeReason) return siegeReason
  if (tweak.targets?.formFactor?.includes('desktop')) {
    return formFactor === 'laptop'
      ? `${tweak.title} is desktop-only, so the laptop's OEM power and thermal policy is preserved`
      : `${tweak.title} needs a confirmed desktop chassis before automatic application`
  }
  return `${tweak.title} needs a compatible rig snapshot before automatic application`
}

/** Rig-aware packs fail closed for rig-targeted actions when a snapshot is
 * unavailable or missing a field needed to prove compatibility. Universal
 * actions remain available; callers should show excluded entries explicitly. */
export function presetTweaksForRig(
  p: PresetBundle,
  spec: SpecProfile | null,
): { eligible: TweakRecord[]; excluded: TweakRecord[] } {
  const all = presetTweaks(p)
  if (!RIG_AWARE_PRESET_IDS.has(p.id)) return { eligible: all, excluded: [] }

  const matchesKnownTargets = (tweak: TweakRecord) => {
    // Do not infer that an unknown chassis is a desktop. The remaining
    // universal, low-risk baseline can still be shown, but laptop-sensitive
    // controls stay out until the rig snapshot proves a desktop system.
    if (LAPTOP_SIEGE_DEFERRED_IDS.has(tweak.id) && spec?.mobo?.isLaptop !== false) return false
    const targets = tweak.targets
    if (!targets) return true
    if (!spec) return false
    if (targets.cpuVendor?.length && !spec.cpu.vendor) return false
    if (targets.gpuVendor?.length && !spec.gpu.vendor) return false
    if (
      (targets.osMinBuild != null || targets.osMaxBuild != null) &&
      (!Number.isFinite(spec.os?.build) || (spec.os?.build ?? 0) <= 0)
    ) return false
    if (targets.ramMinGb != null && (!Number.isFinite(spec.ram?.totalGb) || (spec.ram?.totalGb ?? 0) <= 0)) return false
    if (targets.formFactor?.length && typeof spec.mobo?.isLaptop !== 'boolean') return false
    return tweakMatchesSpec(tweak, spec)
  }

  return {
    eligible: all.filter(matchesKnownTargets),
    excluded: all.filter((tweak) => !matchesKnownTargets(tweak)),
  }
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
