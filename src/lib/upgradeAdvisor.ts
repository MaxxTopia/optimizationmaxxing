/**
 * Upgrade Advisor — turns detected specs into a Fortnite-weighted upgrade call.
 *
 * Design (per the two-tier model):
 *  1. Find the BOTTLENECK first, not parts first. Fortnite is CPU-limited at
 *     competitive settings, so the component weighting is game-specific, not a
 *     generic AAA benchmark.
 *  2. Give TWO platform-aware picks for that bottleneck:
 *       - dropIn  : the best part that fits the user's CURRENT socket — no new
 *                   motherboard/RAM. This is the recommended, one-part move.
 *       - overall : the genuinely best part even if it means replatforming,
 *                   with `overallReplatform` + `replatformCost` spelling out the
 *                   full CPU+mobo+RAM shopping list so nobody buys a chip that
 *                   won't fit.
 *
 * The tool already reads the CPU vendor/gen + motherboard, so it can tell a
 * drop-in from a platform jump — that's what makes an honest "best part" call
 * possible instead of a naive single recommendation.
 */

import type { SpecProfile } from './tauri'

export type Platform =
  | 'AM4'
  | 'AM5'
  | 'LGA1700'
  | 'LGA1851'
  | 'LGA1200'
  | 'older'
  | 'unknown'

export interface UpgradePick {
  part: string
  note: string
  link?: string
}

export interface UpgradePlan {
  bottleneck: 'cpu' | 'gpu' | 'ram' | 'none'
  platform: Platform
  headline: string
  detail: string
  /** Best part that fits the current board (no replatform). Null when the
   * current platform is too old for a worthwhile drop-in. */
  dropIn: UpgradePick | null
  /** Best part regardless of platform. */
  overall: UpgradePick | null
  /** True when `overall` requires a new motherboard/RAM. */
  overallReplatform: boolean
  /** What the replatform actually costs in parts, when relevant. */
  replatformCost?: string
  /** Extra context (e.g. the monitor we can't detect). */
  notes: string[]
  /** Transparency: the three component scores (0-100) that drove the call. */
  scores: { cpu: number; gpu: number; ram: number }
}

const LINK_9800X3D =
  'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9800x3d.html'
const LINK_5800X3D =
  'https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x3d.html'
const LINK_14700K =
  'https://www.intel.com/content/www/us/en/products/sku/236785/intel-core-i7-processor-14700k/specifications.html'
const LINK_RTX5070TI =
  'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/'

function hasX3D(cpu: SpecProfile['cpu']): boolean {
  return /x3d/i.test(`${cpu.model} ${cpu.marketing}`)
}

function inferPlatform(spec: SpecProfile): Platform {
  const v = spec.cpu.vendor.toLowerCase()
  const gen = spec.cpu.genOrZen
  const chip = (spec.mobo.product || '').toLowerCase()
  if (v.includes('amd')) {
    if (gen != null) return gen >= 4 ? 'AM5' : 'AM4'
    if (/\b[xb]6\d0|\b[xba]8\d0/.test(chip)) return 'AM5' // 600/800-series chipsets
    if (/\b[xb]5\d0|\b[xb]4\d0|\bx370|\bb350|\ba320/.test(chip)) return 'AM4'
    return 'unknown'
  }
  if (v.includes('intel')) {
    if (gen != null) {
      if (gen >= 15) return 'LGA1851'
      if (gen >= 12) return 'LGA1700'
      if (gen >= 10) return 'LGA1200'
      return 'older'
    }
    return 'unknown'
  }
  return 'unknown'
}

function isDdr5Platform(spec: SpecProfile, platform: Platform): boolean {
  if (platform === 'AM5' || platform === 'LGA1851') return true
  if (platform === 'AM4' || platform === 'LGA1200' || platform === 'older') return false
  // LGA1700 boards ship in DDR4 or DDR5 flavors — infer from the installed kit.
  const speed = spec.ram.speedMts ?? spec.ram.configuredSpeedMts ?? 0
  return speed >= 4400
}

function cpuScore(spec: SpecProfile): number {
  const v = spec.cpu.vendor.toLowerCase()
  const g = spec.cpu.genOrZen ?? 0
  let s: number
  if (hasX3D(spec.cpu)) s = 95
  else if (v.includes('amd')) {
    if (g >= 5) s = 80
    else if (g >= 4) s = 74
    else if (g >= 3) s = 64
    else if (g >= 2) s = 44
    else s = 34 // Zen / Zen+ (1000 / 2000 series)
  } else if (v.includes('intel')) {
    if (g >= 15) s = 80
    else if (g >= 14) s = 78
    else if (g >= 13) s = 74
    else if (g >= 12) s = 66
    else if (g >= 10) s = 46
    else s = 34
  } else s = 40
  if (spec.cpu.cores && spec.cpu.cores < 6) s -= 15
  return Math.max(0, Math.min(100, s))
}

function gpuScore(spec: SpecProfile): number {
  const m = `${spec.gpu.model}`.toLowerCase()
  if (/rtx\s?50\d\d/.test(m)) return 96
  if (/rtx\s?40\d\d/.test(m)) return 92
  if (/rtx\s?30\d\d/.test(m)) return 82
  if (/rtx\s?20\d\d/.test(m)) return 72
  if (/gtx\s?16\d\d/.test(m)) return 60
  if (/gtx\s?10\d\d/.test(m)) return 50
  if (/gtx\s?9\d\d/.test(m)) return 38
  if (/rx\s?7\d{3}/.test(m)) return 88
  if (/rx\s?6\d{3}/.test(m)) return 78
  if (/rx\s?5\d{3}/.test(m)) return 62
  if (/(uhd|iris|vega|radeon\s+graphics)/.test(m) || /integrated/.test(m)) return 26
  return 55 // unknown discrete — assume midrange rather than alarm
}

function ramScore(spec: SpecProfile, platform: Platform): number {
  const gb = spec.ram.totalGb
  let s: number
  if (gb < 8) s = 20
  else if (gb < 16) s = 42
  else if (gb < 32) s = 70
  else s = 90
  const speed = spec.ram.configuredSpeedMts ?? spec.ram.speedMts ?? 0
  if (platform === 'AM5' || platform === 'LGA1851') {
    if (speed && speed < 6000) s -= 8
  } else if (platform === 'AM4') {
    if (speed && speed < 3200) s -= 10
    else if (speed && speed < 3600) s -= 4
  } else if (platform === 'LGA1700') {
    if (speed && speed < 5600) s -= 6
  }
  if (spec.ram.stickCount < 2) s -= 12 // single channel ≈ half the bandwidth
  return Math.max(0, Math.min(100, s))
}

function cpuPlan(platform: Platform): Pick<
  UpgradePlan,
  'dropIn' | 'overall' | 'overallReplatform' | 'replatformCost'
> {
  const overall: UpgradePick = {
    part: 'AMD Ryzen 7 9800X3D',
    note: 'The outright fastest gaming CPU for Fortnite — 3D V-cache delivers the biggest 1%-low jump you can buy.',
    link: LINK_9800X3D,
  }
  if (platform === 'AM5') {
    return { dropIn: overall, overall, overallReplatform: false }
  }
  if (platform === 'AM4') {
    return {
      dropIn: {
        part: 'AMD Ryzen 7 5800X3D',
        note: "Drops straight into your AM4 board with a BIOS update — no new motherboard or RAM. X3D V-cache is the single biggest Fortnite lever on AM4 and a massive jump from an older Ryzen. (The 5700X3D is the near-equal value pick.)",
        link: LINK_5800X3D,
      },
      overall,
      overallReplatform: true,
      replatformCost: 'a new AM5 board + DDR5-6000 kit (CPU + motherboard + RAM together)',
    }
  }
  if (platform === 'LGA1700') {
    return {
      dropIn: {
        part: 'Intel Core i7-14700K',
        note: "The best gaming chip your LGA1700 board takes without replacing it (BIOS update + latest microcode). Strong, but still trails AMD X3D in Fortnite 1% lows.",
        link: LINK_14700K,
      },
      overall,
      overallReplatform: true,
      replatformCost: 'a new AM5 board + DDR5-6000 kit (leaving the Intel platform for the X3D)',
    }
  }
  if (platform === 'LGA1851') {
    return {
      dropIn: {
        part: 'Intel Core Ultra 9 285K',
        note: 'The top chip your LGA1851 board takes. A great all-rounder, but AMD X3D still wins Fortnite 1% lows.',
      },
      overall,
      overallReplatform: true,
      replatformCost: 'a new AM5 board + DDR5-6000 kit (leaving the Intel platform for the X3D)',
    }
  }
  // older / unknown — any modern chip is a full new build
  return {
    dropIn: null,
    overall,
    overallReplatform: true,
    replatformCost:
      'a whole new platform — CPU + motherboard + DDR5 (your current board is too old for a worthwhile drop-in)',
  }
}

function gpuPlan(): Pick<UpgradePlan, 'dropIn' | 'overall' | 'overallReplatform'> {
  const pick: UpgradePick = {
    part: 'NVIDIA RTX 5070 Ti (or 5080)',
    note: "For competitive Fortnite you rarely need more — either holds 240+ FPS in Performance mode with Reflex. A GPU is always a drop-in: it fits any modern board, no platform change.",
    link: LINK_RTX5070TI,
  }
  return { dropIn: pick, overall: pick, overallReplatform: false }
}

function ramPlan(
  spec: SpecProfile,
  platform: Platform,
): Pick<UpgradePlan, 'dropIn' | 'overall' | 'overallReplatform'> {
  const pick: UpgradePick = isDdr5Platform(spec, platform)
    ? {
        part: '32 GB DDR5-6000 CL30 (2×16)',
        note: 'Dual-channel 32 GB at 6000 MT/s is the competitive sweet spot on your platform — fixes low capacity and slow timings in one matched kit.',
      }
    : {
        part: '32 GB DDR4-3600 CL16 (2×16)',
        note: 'Dual-channel 32 GB at 3600 CL16 is the AM4 sweet spot — matches your current board and fixes both capacity and speed.',
      }
  return { dropIn: pick, overall: pick, overallReplatform: false }
}

export function buildUpgradePlan(spec: SpecProfile): UpgradePlan {
  const platform = inferPlatform(spec)
  const scores = {
    cpu: cpuScore(spec),
    gpu: gpuScore(spec),
    ram: ramScore(spec, platform),
  }
  const bottleneck = (['cpu', 'gpu', 'ram'] as const).slice().sort(
    (a, b) => scores[a] - scores[b],
  )[0]
  const notes = [
    "We can't read your monitor from Windows — if you're not on a 240 Hz+ display, that's the next competitive upgrade after this part.",
  ]

  // Everything healthy → don't invent an upgrade.
  if (scores[bottleneck] >= 78) {
    return {
      bottleneck: 'none',
      platform,
      headline: 'Your rig is already competitive-ready.',
      detail:
        'Nothing here is holding you back for Fortnite — CPU, GPU and RAM all score well. Put money into a high-refresh monitor, dialed settings, and reps instead of parts.',
      dropIn: null,
      overall: null,
      overallReplatform: false,
      notes,
      scores,
    }
  }

  if (bottleneck === 'cpu') {
    const p = cpuPlan(platform)
    return {
      bottleneck,
      platform,
      headline: `Your CPU is the bottleneck (${spec.cpu.model}).`,
      detail: `Fortnite is CPU-limited at competitive settings, so your ${spec.cpu.model} is what's capping your frames and 1% lows — not your GPU. This is the upgrade that moves the needle most.`,
      notes,
      scores,
      ...p,
    }
  }
  if (bottleneck === 'gpu') {
    const p = gpuPlan()
    return {
      bottleneck,
      platform,
      headline: `Your GPU is the bottleneck (${spec.gpu.model}).`,
      detail: `Your ${spec.gpu.model} is struggling to hold competitive frame rates even in Performance mode. A GPU is a universal drop-in — no platform change, whatever board you're on.`,
      notes,
      scores,
      ...p,
    }
  }
  const p = ramPlan(spec, platform)
  const ramWhy =
    spec.ram.totalGb < 16
      ? "16 GB is the modern floor and you're under it"
      : spec.ram.stickCount < 2
        ? 'a single stick runs about half the bandwidth of a matched pair'
        : 'faster, dual-channel memory'
  return {
    bottleneck,
    platform,
    headline: `Your RAM is the bottleneck (${spec.ram.totalGb} GB${
      spec.ram.stickCount < 2 ? ', single-channel' : ''
    }).`,
    detail: `${ramWhy} — RAM is the cheapest fix of the three and it matches your current board, so it's a pure drop-in.`,
    notes,
    scores,
    ...p,
  }
}
