/**
 * Research article registry. Each .md file in resources/research/ is
 * imported as a raw string via Vite's ?raw suffix and exposed here for
 * the /guides page to render. Schema gained per-game tagging in v0.1.42.
 */
import nvidiaReflex from '../../resources/research/nvidia-reflex.md?raw'
import browsers from '../../resources/research/browsers.md?raw'
import gamingMice from '../../resources/research/gaming-mice.md?raw'
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

export const RESEARCH: ResearchArticle[] = [
  {
    id: 'nvidia-reflex',
    title: 'NVIDIA Reflex — does it add input delay?',
    blurb:
      'No. Reflex reduces input lag by 5–30 ms depending on workload. Use ON+BOOST.',
    badge: 'NVIDIA',
    body: nvidiaReflex,
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
    id: 'per-game-windows',
    title: 'Best Windows version per game',
    blurb:
      'Win11 22H2 / 23H2 for stability. 24H2 has DPC + HID quirks for some titles. LTSC if you have the license.',
    badge: 'OS',
    body: perGameWindows,
    perGameCallouts: {
      fortnite: 'Win11 23H2 is the safest for FNCS. 24H2 introduced HID input-stack quirks that Bugha + others moved away from.',
      valorant: 'Vanguard runs cleanly on 22H2 / 23H2 / 24H2. LTSC complicates Vanguard updates — not recommended.',
      cs2: 'CS2 is GPU-bound; OS version barely moves the needle. Pick whichever updates you tolerate best.',
    },
  },
  {
    id: 'amd-intel',
    title: 'AMD + Intel CPU features — keep / disable',
    blurb:
      'HT/SMT mostly stay on. Intel APO on Core Ultra. AMD PBO + Curve Optimizer. VBS off for gaming.',
    badge: 'CPU',
    body: amdIntel,
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
    id: 'discord-low-fps',
    title: 'Discord — low-FPS while gaming (4 toggles)',
    blurb:
      'Hardware Acceleration off + Overlay off + Streamer Mode off + Reduce Motion. Why we can\'t automate this (Discord uses leveldb).',
    badge: 'APP',
    body: discordLowFps,
  },
  {
    id: 'recommended-gear',
    title: 'Recommended gear — what to look for, not which to buy',
    blurb:
      'Mouse / keyboard / pad / monitor / network frameworks. Specs that matter, what we don\'t ship affiliate links for, what an actual VIP edition would unlock.',
    badge: 'GEAR',
    body: recommendedGear,
  },
  {
    id: 'os-comparison',
    title: 'Lightweight Windows distros — Atlas, X-Lite, Tiny11, Ghost Spectre, ReviOS',
    blurb:
      'Side-by-side: anticheat compat, update story, idle RAM, install effort, recommended-for. Includes our verdict on whether building a maxxer-OS makes sense.',
    badge: 'OS',
    body: osComparison,
    perGameCallouts: {
      fortnite: 'EAC tolerates most distros; tournament rigs should still run vanilla 24H2 + tweaks.',
      valorant: 'Vanguard requires Secure Boot + TPM. Atlas, X-Lite (default), and Tiny11 keep them; Ghost Spectre may strip them — verify before you main Val.',
      cs2: 'VAC is permissive — any distro works. CS2 is GPU-bound; lightweight OS gain is small.',
    },
  },
  {
    id: 'bios-tournament-compliance',
    title: 'BIOS + system tweaks vs tournament rules (FNCS / VCT / VAC)',
    blurb:
      'Per-anticheat eligibility breakdown — what FNCS, Vanguard, BattlEye, and VAC actually check. Maps every catalog tweak that could break your run to a verdict.',
    badge: 'TOURNAMENT',
    body: biosTournamentCompliance,
    perGameCallouts: {
      fortnite: 'FNCS rules require TPM 2.0 + a non-tampered HWID. Most BIOS perf tweaks are safe.',
      valorant: 'VCT requires Secure Boot + TPM 2.0 + Vanguard. Disabling VBS is allowed; disabling Hyper-V is borderline.',
      cs2: 'VAC checks for known cheats only — perf BIOS tweaks pass. ESL/FACEIT add their own anticheat clients.',
      warzone: 'Ricochet kernel-mode AC plus BattlEye on some modes — leave Secure Boot + TPM on.',
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
    id: 'winring0-av-exclusion',
    title: 'AV blocking WinRing0 / LHM? Add this exclusion',
    blurb:
      "If Live Thermals shows 'probe failed' or CPU package temp won't appear after Enable, your AV is blocking the WinRing0 driver. Add-MpPreference snippet inside.",
    badge: 'TROUBLESHOOTING',
    body: winring0AvExclusion,
  },
  {
    id: 'latency-budget',
    title: 'The latency budget — every layer, cited',
    blurb:
      "Total click-to-pixel: 25-35 ms tuned vs 50-80 ms stock. Per-layer breakdown with Battle(non)sense + Reflex whitepaper + Blur Busters citations. What's tunable, what's hardware-fixed.",
    badge: 'LATENCY',
    body: latencyBudget,
    applicableGames: ['fortnite', 'valorant', 'cs2', 'apex', 'warzone', 'overwatch'],
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
    id: 'fortnite-pro-settings',
    title: 'Fortnite — in-game pro settings (cited)',
    blurb:
      "The catalog handles Engine.ini + GameUserSettings.ini. The remaining input-lag wins live inside Fortnite's Settings menu — Reflex+Boost, Performance render mode, View Distance Far (not Epic), shadows off. Cited from Peterbot/Clix/Bugha public configs.",
    badge: 'FORTNITE',
    body: fortniteProSettings,
    applicableGames: ['fortnite'],
  },
]
