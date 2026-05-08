/**
 * Research article registry. Each .md file in resources/research/ is
 * imported as a raw string via Vite's ?raw suffix and exposed here for
 * the Toolkit page to render in collapsible cards.
 */
import nvidiaReflex from '../../resources/research/nvidia-reflex.md?raw'
import browsers from '../../resources/research/browsers.md?raw'
import gamingMice from '../../resources/research/gaming-mice.md?raw'
import perGameWindows from '../../resources/research/per-game-windows-version.md?raw'
import amdIntel from '../../resources/research/amd-intel-features.md?raw'
import biosPerChipset from '../../resources/research/bios-per-chipset.md?raw'
import discordLowFps from '../../resources/research/discord-low-fps.md?raw'
import recommendedGear from '../../resources/research/recommended-gear.md?raw'

export interface ResearchArticle {
  id: string
  title: string
  blurb: string
  /** Eyebrow chip — 'PRO' / 'INTEL' / 'TOOLS' / etc. */
  badge: string
  body: string
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
  },
  {
    id: 'gaming-mice',
    title: 'Gaming mice + competitive settings',
    blurb:
      '800 DPI default, 1000 Hz minimum (4000+ on flagship), <1 mm LOD, accel OFF. Mouse model matrix included.',
    badge: 'PERIPHERAL',
    body: gamingMice,
  },
  {
    id: 'per-game-windows',
    title: 'Best Windows version per game',
    blurb:
      'Win11 22H2 / 23H2 for stability. 24H2 has DPC + HID quirks for some titles. LTSC if you have the license.',
    badge: 'OS',
    body: perGameWindows,
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
]
