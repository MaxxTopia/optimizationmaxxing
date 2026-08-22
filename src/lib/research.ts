/**
 * Research article registry. Each .md file in resources/research/ is
 * imported as a raw string via Vite's ?raw suffix and exposed here for
 * the /guides page to render. Schema gained per-game tagging in v0.1.42.
 */
import nvidiaReflex from '../../resources/research/nvidia-reflex.md?raw'
import browsers from '../../resources/research/browsers.md?raw'
import gamingMice from '../../resources/research/gaming-mice.md?raw'
import hallEffectKeyboards from '../../resources/research/hall-effect-keyboards.md?raw'
import perGameWindows from '../../resources/research/per-game-windows-version.md?raw'
import amdIntel from '../../resources/research/amd-intel-features.md?raw'
import biosPerChipset from '../../resources/research/bios-per-chipset.md?raw'
import discordLowFps from '../../resources/research/discord-low-fps.md?raw'
import recommendedGear from '../../resources/research/recommended-gear.md?raw'
import osComparison from '../../resources/research/os-comparison.md?raw'
import biosTournamentCompliance from '../../resources/research/bios-tournament-compliance.md?raw'
import scewinAdvanced from '../../resources/research/scewin-advanced.md?raw'
import winring0AvExclusion from '../../resources/research/winring0-av-exclusion.md?raw'
import latencyBudget from '../../resources/research/latency-budget.md?raw'
import grindLayer from '../../resources/research/grind-layer.md?raw'
import fortniteProSettings from '../../resources/research/fortnite-pro-settings.md?raw'
import valorantProSettings from '../../resources/research/valorant-pro-settings.md?raw'
import nvidiaProfileInspector from '../../resources/research/nvidia-profile-inspector.md?raw'
import standbyListCleaner from '../../resources/research/standby-list-cleaner.md?raw'
import dscpRouterCompanion from '../../resources/research/dscp-router-companion.md?raw'
import rgbShutoff from '../../resources/research/rgb-shutoff.md?raw'
import ramBiosRecipes from '../../resources/research/ram-bios-recipes.md?raw'
import pickupMacros from '../../resources/research/pickup-macros.md?raw'
import snakeOilTweaks from '../../resources/research/snake-oil-tweaks.md?raw'
import nextMargin from '../../resources/research/where-your-next-margin-is.md?raw'
import amdRadeonAdrenalin from '../../resources/research/amd-radeon-adrenalin.md?raw'
import intelArcSetup from '../../resources/research/intel-arc-setup.md?raw'

import type { GameId } from './games'

export interface ResearchArticle {
  id: string
  title: string
  blurb: string
  /** Eyebrow chip — 'PRO' / 'INTEL' / 'TOOLS' / etc. */
  badge: string
  body: string
  /** Optional per-game applicability. Omit/empty = applies universally. */
  applicableGames?: GameId[]
  /** Short single-line per-game callout shown as a pill row at the top of
   * the article — e.g. "Fortnite: Brave wins for tournament rigs (no FPS
   * drops with extension blocking)." */
  perGameCallouts?: Partial<Record<GameId, string>>
  /** Optional 'advanced' tag — surfaces in the SCEWIN/overclocks track. */
  advanced?: boolean
}

// Order convention (v0.1.70): advanced + highest-leverage guides at the top
// (NVPI / SCEWIN / BIOS / tournament-compliance / latency-budget / standby
// cleaner). High-impact basics next (Reflex / AMD-Intel / per-game / per-game
// pro settings / gaming-mice / grind-layer / gear). Niche / troubleshooting
// last (WinRing0 AV / Discord low-FPS / browsers / lightweight distros).
export const RESEARCH: ResearchArticle[] = [
  // ── Tier 1: advanced + highest-leverage ──────────────────────────────
  {
    id: 'snake-oil-tweaks',
    title: "Tweaks we deliberately DON'T do (and why)",
    blurb:
      "The honest list: popular 'FPS boost' tweaks that 2026 evidence shows are placebo or harmful (page file off, Realtime priority, 8000 Hz polling, debloat scripts, disabling Defender/mitigations) plus the ones whose advice reversed (HAGS/Game Mode stay ON, bcdedit clock flags revert, MPO is conditional). Why we left them out.",
    badge: 'NO SNAKE-OIL',
    body: snakeOilTweaks,
  },
  {
    id: 'where-your-next-margin-is',
    title: 'Where your next margin is — after the scan comes back clean',
    blurb:
      "The honest layer model: software/config is ~70% of the gap and the cheapest 70% you'll ever buy — but 'everything except hardware' skips two layers. After a clean scan the order is in-game/peripheral settings (we can only advise) -> your own mechanics (the biggest lever) -> targeted hardware only where Match Scan proves you're bottlenecked. Don't buy a GPU to fix a 60Hz cable.",
    badge: 'READ FIRST',
    body: nextMargin,
  },
  {
    id: 'nvidia-profile-inspector',
    title: 'NVIDIA Profile Inspector — advanced per-game driver profiles',
    blurb:
      'NVCP exposes only part of the driver surface. The rest lives in .nip profiles shared by advanced users (for example, per-game threading or limiter settings). Possible gains are workload- and driver-dependent; articleware only.',
    badge: 'NVIDIA',
    body: nvidiaProfileInspector,
    advanced: true,
    perGameCallouts: {
      fortnite: 'Threaded Optimization OFF in NVPI fixes UE5 main-thread stutter that NVCP can\'t reach.',
      cs2: 'NVPI Frame Rate Limiter v3 mode beats both in-game cap and NVCP UI cap.',
      valorant: 'Per-app prefer-max-performance + Vanguard-safe NVPI changes.',
      apex: 'Low-latency mode = Ultra on the per-game profile. ImperialHal-tier setting.',
    },
  },
  {
    id: 'scewin-advanced',
    title: 'SCEWIN — read-only BIOS export for advanced tuners',
    blurb:
      'SCEWIN exports your full BIOS in plain text — irreplaceable for diagnostics + before-you-flash backup. Article-only; we never auto-edit BIOS at runtime.',
    badge: 'ADVANCED',
    body: scewinAdvanced,
    advanced: true,
  },
  {
    id: 'ram-bios-recipes',
    title: 'RAM tightening — copy-paste BIOS recipes per IC',
    blurb:
      'Conservative Buildzoid/DRAM-Calculator starting points for common DDR4 and DDR5 ICs. Enter them manually, then validate with TestMem5 or another memory test; the result depends on the kit, board, controller, and game.',
    badge: 'BIOS',
    body: ramBiosRecipes,
    advanced: true,
  },
  {
    id: 'bios-per-chipset',
    title: 'BIOS settings per chipset (Z790 / X670E / B650 / Z890)',
    blurb:
      'ReBAR, EXPO, Curve Optimizer, LLC, C-states. What to flip per board family. Backup before tuning.',
    badge: 'BIOS',
    body: biosPerChipset,
  },
  {
    id: 'bios-tournament-compliance',
    title: 'BIOS + system tweaks vs tournament rules (FNCS / VCT / VAC)',
    blurb:
      'Per-anticheat eligibility breakdown — what FNCS, Vanguard, BattlEye, and VAC actually check. Maps every catalog tweak that could break your run to a verdict.',
    badge: 'TOURNAMENT',
    body: biosTournamentCompliance,
    perGameCallouts: {
      fortnite: 'Epic\'s current tournament floor includes Secure Boot, TPM 2.0, and IOMMU. Treat BIOS and security changes as eligibility-sensitive.',
      valorant: 'Riot requirements can change by Windows build and event. Keep Secure Boot, TPM 2.0, and Vanguard healthy; do not disable security features for a tournament without checking the current rules.',
      cs2: 'VAC checks for known cheats only — perf BIOS tweaks pass. ESL/FACEIT add their own anticheat clients.',
      warzone: 'Ricochet kernel-mode AC plus BattlEye on some modes — leave Secure Boot + TPM on.',
    },
  },
  {
    id: 'dscp-router-companion',
    title: 'DSCP / QoS router companion — make the catalog tag actually do something',
    blurb:
      'Our QoS catalog tweak tags game packets DSCP 46. This page covers the matching router-side rule for ASUS / Netgear / TP-Link / Ubiquiti / pfSense / OpenWRT.',
    badge: 'NETWORK',
    body: dscpRouterCompanion,
    advanced: true,
  },
  {
    id: 'latency-budget',
    title: 'The latency budget — every layer, cited',
    blurb:
      "Click-to-pixel is a stack, not a universal score. Per-layer examples with Battle(non)sense + Reflex whitepaper + Blur Busters citations show what's tunable and what's hardware-fixed.",
    badge: 'LATENCY',
    body: latencyBudget,
    applicableGames: ['fortnite', 'valorant', 'cs2', 'apex', 'warzone', 'overwatch'],
  },
  {
    id: 'standby-list-cleaner',
    title: 'Standby memory list — silent stutter source pros clean every session',
    blurb:
      'Why pros restart their game every 2-3 hours. ISLC + RAMMap link out + the underlying NtSetSystemInformation API. Integrated standby cleaner ships v0.1.63+.',
    badge: 'MEMORY',
    body: standbyListCleaner,
  },

  // ── Tier 2: high-impact basics ───────────────────────────────────────
  {
    id: 'amd-radeon-adrenalin',
    title: 'AMD Radeon — competitive setup (Anti-Lag 2, not Anti-Lag+)',
    blurb:
      "Radeon-specific low-latency stack: use the anti-cheat-safe Anti-Lag 2 (CS2), NEVER the old Anti-Lag+ that VAC-banned people. Skip HYPR-RX/Chill/Boost for competitive; native res over RSR. The Radeon answer to our NVIDIA Profile Inspector guide.",
    badge: 'RADEON',
    body: amdRadeonAdrenalin,
    perGameCallouts: {
      cs2: 'CS2 has native Anti-Lag 2 (built with Valve) — turn it on. It is the safe replacement for the banned Anti-Lag+.',
      valorant: 'No native Anti-Lag 2 yet — use in-game frame-rate cap + native res; leave driver Anti-Lag+ OFF.',
      fortnite: 'No native Anti-Lag 2 — cap FPS below refresh, native res, Chill/Boost OFF.',
    },
  },
  {
    id: 'intel-arc-setup',
    title: 'Intel Arc — competitive setup (ReBAR + drivers + XeLL)',
    blurb:
      'Arc is driver-bound and ReBAR-dependent: Resizable BAR is a compatibility baseline, current drivers matter, and XeLL is the low-latency piece to evaluate. Treat any percentage as game- and driver-specific; skip frame generation for competitive play.',
    badge: 'ARC',
    body: intelArcSetup,
  },
  {
    id: 'nvidia-reflex',
    title: 'NVIDIA Reflex — does it add input delay?',
    blurb:
      'No blanket latency promise: Reflex changes the render queue based on workload. Measure it with the in-game indicator and use ON+BOOST when the game supports it.',
    badge: 'NVIDIA',
    body: nvidiaReflex,
  },
  {
    id: 'amd-intel',
    title: 'AMD + Intel CPU features — keep / disable',
    blurb:
      'HT/SMT usually stay on. Intel APO on supported titles. AMD PBO + Curve Optimizer. VBS is an eligibility and security trade-off, not an automatic gaming-off switch.',
    badge: 'CPU',
    body: amdIntel,
  },
  {
    id: 'per-game-windows',
    title: 'Best Windows version per game',
    blurb:
      'Use a supported Windows 11 branch (24H2 or 25H2 where offered), then compare your own clean installs in OS Lab. Custom and stripped builds trade background load for support, update, and anti-cheat risk.',
    badge: 'OS',
    body: perGameWindows,
    perGameCallouts: {
      fortnite: 'For tournament eligibility, start with a fully patched supported Windows 11 install and verify Secure Boot, TPM 2.0, and IOMMU; do not rank builds from creator anecdotes alone.',
      valorant: 'Keep Windows and Vanguard current. LTSC or stripped builds can change driver and anti-cheat behavior, so validate before using them for ranked play.',
      cs2: 'CS2 is GPU-bound; OS version barely moves the needle. Pick whichever updates you tolerate best.',
    },
  },
  {
    id: 'fortnite-pro-settings',
    title: 'Fortnite — in-game pro settings (cited)',
    blurb:
      "The catalog handles Engine.ini + GameUserSettings.ini. The remaining input-lag wins live inside Fortnite's Settings menu — Reflex+Boost, Performance render mode, View Distance Far (not Epic), shadows off. Cited from Peterbot/Clix/Bugha public configs.",
    badge: 'FORTNITE',
    body: fortniteProSettings,
    applicableGames: ['fortnite'],
  },
  {
    id: 'valorant-pro-settings',
    title: 'Valorant — in-game pro settings (cited)',
    blurb:
      "Vanguard fights config-dir writes — we ship no FileWrite tweak. This is the next-best path: TenZ/yay/Demon1/aspas in-game consensus stack. HRTF on, Improve Clarity off, frame-rate-limit at 2× refresh, full graphics low.",
    badge: 'VALORANT',
    body: valorantProSettings,
    applicableGames: ['valorant'],
  },
  {
    id: 'pickup-macros',
    title: 'Pickup macros — the "suction cup" loot grab (Wooting DKS / SteelSeries GG)',
    blurb:
      'The single-key spam-pickup pros run for Offspawn fights. Step-by-step setup on Wooting (DKS / Advanced Keys) + SteelSeries Apex Pro (GG Macro Editor). Anticheat reality check on what\'s OK vs ranked-only vs tournament-banned.',
    badge: 'PERIPHERAL',
    body: pickupMacros,
    perGameCallouts: {
      fortnite: 'E spam = empty Offspawn floors in <0.5 s. Wooting DKS or Apex Pro GG both work — keyboard firmware does the spam, no host-side macro driver runs.',
      apex: 'Tap-strafe + lurch macros are a separate (banned) category. Pickup-spam on E / interact is in the same lighter family as Fortnite.',
    },
  },
  {
    id: 'hall-effect-keyboards',
    title: 'Hall-Effect keyboard tier list (2026)',
    blurb:
      'Wooting 80HE / 60HE+ vs Apex Pro Gen 3 vs Drunkdeer G75 vs Endgame KB65HE. Tier list, per-game actuation / rapid-trigger settings, software comparison, pro adoption rates. Every Major top-10 finalist runs HE in 2026.',
    badge: 'PERIPHERAL',
    body: hallEffectKeyboards,
    perGameCallouts: {
      fortnite: 'Build keys → actuation 0.2 mm + RT 0.1 mm for edit speed. WASD → 1.0 mm. Veno + Khanada on Wooting.',
      valorant: 'WASD → 0.5 mm + RT 0.1 mm = pure counter-strafe. Abilities → 1.5 mm to avoid mis-taps.',
      cs2: 'Same as Valorant — every Major top-10 finalist on HE in 2026.',
      apex: 'WASD → 0.3 mm + RT 0.1 mm for tap-strafe / lurch timing. Crouch/slide → 0.8 mm.',
    },
  },
  {
    id: 'gaming-mice',
    title: 'Gaming mice + competitive settings',
    blurb:
      'Pro consensus pulled from current Codelife videos + ProSettings.net. DPI bands by genre, polling guidance, lift-off. Mouse-model matrix included.',
    badge: 'PERIPHERAL',
    body: gamingMice,
    perGameCallouts: {
      fortnite: 'Most build-fight pros: 800–1600 DPI, low-mid sens (~12–18 cm/360). Polling 1000+ Hz, accel OFF.',
      valorant: 'Tac-shooter band: 800 DPI is the historical default but ~30% of top pros sit at 1600. Same eDPI either way.',
      cs2: 'CS pro median 800 DPI, 0.6–1.0 sens. 1.6 m/360 is the modern flick band.',
      apex: 'Higher DPI tolerated (1600–3200) — strafe-heavy aim benefits from finer increments.',
    },
  },
  {
    id: 'grind-layer',
    title: 'The grind layer — sleep, sessions, warmups, body',
    blurb:
      "Pros publish settings — they rarely publish sleep schedules. Aussie's PT background, Bugha's recovery research, Stanford sleep + athletic performance data, the 90/10 cadence pros actually run.",
    badge: 'GRIND',
    body: grindLayer,
    applicableGames: ['fortnite', 'valorant', 'cs2', 'apex', 'warzone', 'osu', 'overwatch'],
  },
  {
    id: 'recommended-gear',
    title: 'Recommended gear — what to look for, not which to buy',
    blurb:
      'Mouse / keyboard / pad / monitor / network frameworks. Specs that matter, what we don\'t ship affiliate links for, what an actual VIP edition would unlock.',
    badge: 'GEAR',
    body: recommendedGear,
  },

  // ── Tier 3: niche / troubleshooting ──────────────────────────────────
  {
    id: 'winring0-av-exclusion',
    title: 'AV blocking WinRing0 / LHM? Add this exclusion',
    blurb:
      "If Live Thermals shows 'probe failed' or CPU package temp won't appear after Enable, your AV is blocking the WinRing0 driver. Add-MpPreference snippet inside.",
    badge: 'TROUBLESHOOTING',
    body: winring0AvExclusion,
  },
  {
    id: 'rgb-shutoff',
    title: 'Turn RGB off persistently — without leaving software running',
    blurb:
      "LEDs aren't the input-delay tax — iCUE / Synapse / Aura polling USB at 60-1000 Hz is. Catalog tweak kills the autostart; this guide handles persistent LED-off via vendor save-to-flash. T-Force RAM specific flow included.",
    badge: 'PERIPHERAL',
    body: rgbShutoff,
  },
  {
    id: 'discord-low-fps',
    title: 'Discord — low-FPS while gaming (4 toggles)',
    blurb:
      'Hardware Acceleration off + Overlay off + Streamer Mode off + Reduce Motion. Why we can\'t automate this (Discord uses leveldb).',
    badge: 'APP',
    body: discordLowFps,
  },
  {
    id: 'browsers',
    title: 'Browsers for low input delay + low background CPU',
    blurb:
      'Brave for daily, LibreWolf for paranoid. Block ads/trackers; foreground vs background CPU is what matters for gaming.',
    badge: 'BROWSER',
    body: browsers,
    perGameCallouts: {
      fortnite: 'Brave on default Shields keeps idle CPU low even with chat tabs open — no fps dips on UE5 hot zones.',
      valorant: 'Either Brave or Edge (no Copilot daemon). Riot client + browser must coexist for VOD review.',
      cs2: 'Doesn\'t matter much — CS2 idle CPU dwarfs your browser. Use what you trust.',
    },
  },
  {
    id: 'os-comparison',
    title: 'Lightweight Windows distros — Atlas, X-Lite, Tiny11, Ghost Spectre, ReviOS',
    blurb:
      'Side-by-side: anticheat compat, update story, idle RAM, install effort, recommended-for. Includes our verdict on whether building a maxxer-OS makes sense.',
    badge: 'OS',
    body: osComparison,
    perGameCallouts: {
      fortnite: 'EAC behavior varies by build; tournament rigs should start from a supported, fully patched Windows 11 install and verify Epic\'s current requirements.',
      valorant: 'Vanguard commonly requires Secure Boot + TPM on Windows 11. Stripped builds may remove them or alter updates — verify the actual install before ranked play.',
      cs2: 'VAC is permissive — any distro works. CS2 is GPU-bound; lightweight OS gain is small.',
    },
  },
]
