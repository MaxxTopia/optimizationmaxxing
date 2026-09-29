/**
 * Upgrade Advisor — turns detected specs into a Fortnite-weighted upgrade call.
 *
 * Philosophy:
 *  - ALWAYS surface the best real upgrade available for each part — never a
 *    dead-end "you're set." A strong rig still has a ceiling (a 14900K is great,
 *    but AMD's X3D wins Fortnite 1% lows; 32 GB DDR5-6000 is fine, but a tuned
 *    kit shaves a little more). We show those, honestly tiered.
 *  - Rank by IMPACT for competitive Fortnite, not generic AAA:
 *      high   = a real bottleneck holding your frames/1% lows back.
 *      medium = a worthwhile gain (e.g. Intel -> X3D for 1% lows).
 *      low    = diminishing returns / ceiling polish.
 *  - Platform-aware: each pick is split into the best DROP-IN (fits your current
 *    board) vs the best OVERALL (may need a new platform, cost spelled out), so
 *    nobody buys a chip that won't fit.
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

export type Impact = 'high' | 'medium' | 'low'

export interface UpgradePick {
  part: string
  note: string
  link?: string
}

export interface UpgradeOpportunity {
  component: 'cpu' | 'gpu' | 'ram'
  impact: Impact
  /** What they have now. */
  current: string
  /** Best part that fits the current board (no replatform). */
  dropIn: UpgradePick | null
  /** Best part regardless of platform. */
  overall: UpgradePick | null
  /** True when `overall` needs a new motherboard/RAM. */
  overallReplatform: boolean
  replatformCost?: string
}

export interface UpgradePlan {
  /** True when nothing is a hard bottleneck — the opportunities are optional
   * ceiling upgrades rather than fixes. */
  ceiling: boolean
  platform: Platform
  headline: string
  detail: string
  /** Ranked best-impact-first. Empty only if every part is already top-tier. */
  opportunities: UpgradeOpportunity[]
  notes: string[]
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
function isTopX3D(cpu: SpecProfile['cpu']): boolean {
  return /9[89]50?x3d|9800x3d|9850x3d/i.test(`${cpu.model} ${cpu.marketing}`)
}

function inferPlatform(spec: SpecProfile): Platform {
  const v = spec.cpu.vendor.toLowerCase()
  const gen = spec.cpu.genOrZen
  const chip = (spec.mobo.product || '').toLowerCase()
  if (v.includes('amd')) {
    if (gen != null) return gen >= 4 ? 'AM5' : 'AM4'
    if (/\b[xb]6\d0|\b[xba]8\d0/.test(chip)) return 'AM5'
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
    else s = 34
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
  return 55
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
  if (spec.ram.stickCount < 2) s -= 12
  return Math.max(0, Math.min(100, s))
}

// ---- best-part pickers (shared by the opportunity builders) ----

function cpuPicks(platform: Platform): {
  dropIn: UpgradePick | null
  overall: UpgradePick
  overallReplatform: boolean
  replatformCost?: string
} {
  const overall: UpgradePick = {
    part: 'AMD Ryzen 7 9800X3D',
    note: 'The outright fastest gaming CPU for Fortnite — 3D V-cache delivers the biggest 1%-low jump you can buy.',
    link: LINK_9800X3D,
  }
  if (platform === 'AM5') return { dropIn: overall, overall, overallReplatform: false }
  if (platform === 'AM4') {
    return {
      dropIn: {
        part: 'AMD Ryzen 7 5800X3D',
        note: "Drops into your AM4 board with a BIOS update — no new motherboard or RAM. X3D V-cache is the single biggest Fortnite lever on AM4. (5700X3D is the value near-equal.)",
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
        note: "The best gaming chip your LGA1700 board takes without replacing it (BIOS + latest microcode). Still trails AMD X3D in Fortnite 1% lows.",
        link: LINK_14700K,
      },
      overall,
      overallReplatform: true,
      replatformCost: 'a new AM5 board + DDR5-6000 kit (leaving Intel for the X3D)',
    }
  }
  if (platform === 'LGA1851') {
    return {
      dropIn: {
        part: 'Intel Core Ultra 9 285K',
        note: 'The top chip your LGA1851 board takes. Great all-rounder, but AMD X3D still wins Fortnite 1% lows.',
      },
      overall,
      overallReplatform: true,
      replatformCost: 'a new AM5 board + DDR5-6000 kit (leaving Intel for the X3D)',
    }
  }
  return {
    dropIn: null,
    overall,
    overallReplatform: true,
    replatformCost:
      'a whole new platform — CPU + motherboard + DDR5 (your board is too old for a worthwhile drop-in)',
  }
}

function cpuOpportunity(spec: SpecProfile, platform: Platform): UpgradeOpportunity | null {
  if (isTopX3D(spec.cpu)) return null // already the Fortnite king
  const v = spec.cpu.vendor.toLowerCase()
  const g = spec.cpu.genOrZen ?? 0
  const x3d = hasX3D(spec.cpu)
  let impact: Impact
  if (x3d) impact = 'low' // e.g. 5800X3D / 7800X3D — already excellent
  else if ((v.includes('amd') && g >= 4) || (v.includes('intel') && g >= 12)) impact = 'medium'
  else impact = 'high'
  if (spec.cpu.cores && spec.cpu.cores < 6) impact = 'high'
  const p = cpuPicks(platform)
  // Don't offer a same-socket Intel drop-in to someone already on an i9-class
  // chip (e.g. a 14900K) — nothing better fits their board, so only the
  // replatform overall (X3D) is a real upgrade.
  const intelTop =
    v.includes('intel') && /i9|ultra\s?9|1[234]900/i.test(`${spec.cpu.model} ${spec.cpu.marketing}`)
  const dropIn = intelTop ? null : p.dropIn
  return {
    component: 'cpu',
    impact,
    current: spec.cpu.model,
    dropIn,
    overall: p.overall,
    overallReplatform: p.overallReplatform,
    replatformCost: p.replatformCost,
  }
}

function gpuOpportunity(spec: SpecProfile): UpgradeOpportunity | null {
  const m = `${spec.gpu.model}`.toLowerCase()
  if (/rtx\s?50(80|90)/.test(m)) return null // already flagship
  const score = gpuScore(spec)
  // Fortnite is rarely GPU-bound at competitive settings, so cap impact:
  // only a genuinely weak card (can't hold 240+ in Performance mode) is 'high'.
  const impact: Impact = score < 60 ? 'high' : 'low'
  const pick: UpgradePick = {
    part: 'NVIDIA RTX 5070 Ti (or 5080)',
    note:
      score < 60
        ? "Your card is struggling to hold competitive frame rates. Either of these locks 240+ FPS in Performance mode. A GPU is a universal drop-in — no platform change."
        : "Only worth it if you also play GPU-heavy titles or want 1440p+ — for Fortnite at competitive settings your current card isn't the limiter. A GPU is always a drop-in.",
    link: LINK_RTX5070TI,
  }
  return {
    component: 'gpu',
    impact,
    current: spec.gpu.model,
    dropIn: pick,
    overall: pick,
    overallReplatform: false,
  }
}

function ramOpportunity(spec: SpecProfile, platform: Platform): UpgradeOpportunity | null {
  const gb = spec.ram.totalGb
  const speed = spec.ram.configuredSpeedMts ?? spec.ram.speedMts ?? 0
  const single = spec.ram.stickCount < 2
  const ddr5 = isDdr5Platform(spec, platform)
  const fastEnough = ddr5 ? speed >= 6000 : speed >= 3600

  let impact: Impact
  let pick: UpgradePick
  if (gb < 16 || single) {
    impact = 'high'
    pick = ddr5
      ? { part: '32 GB DDR5-6000 CL30 (2×16)', note: `${single ? 'A single stick runs about half the bandwidth of a matched pair. ' : ''}Dual-channel 32 GB at 6000 is the competitive sweet spot — matches your board.` }
      : { part: '32 GB DDR4-3600 CL16 (2×16)', note: `${single ? 'A single stick runs about half the bandwidth of a matched pair. ' : ''}Dual-channel 32 GB at 3600 CL16 is the AM4 sweet spot — matches your board.` }
  } else if (gb < 32) {
    impact = 'medium'
    pick = ddr5
      ? { part: '32 GB DDR5-6000 CL30 (2×16)', note: '16 GB is fine today but tight with a browser/Discord/OBS open behind Fortnite — 32 GB removes that ceiling.' }
      : { part: '32 GB DDR4-3600 CL16 (2×16)', note: '16 GB is fine today but tight with a browser/Discord/OBS open behind Fortnite — 32 GB removes that ceiling.' }
  } else {
    // 32 GB+ : capacity is fine. Only a speed/timing ceiling remains.
    impact = 'low'
    if (fastEnough) {
      pick = ddr5
        ? { part: 'Tuned DDR5 (6400+ CL30 or hand-tuned subtimings)', note: 'Your capacity + speed are already in the sweet spot. Faster/tighter-timing kits give only marginal Fortnite 1%-low gains — a polish upgrade, not a fix.' }
        : { part: 'Tuned DDR4 (3600 CL14 / tightened subtimings)', note: 'Your 32 GB is already good. Tighter timings give only marginal Fortnite 1%-low gains — a polish upgrade, not a fix.' }
    } else {
      pick = ddr5
        ? { part: '32 GB DDR5-6000 CL30 (2×16)', note: 'Capacity is set; bumping to 6000 CL30 (or enabling EXPO) is the one real RAM gain left on your platform.' }
        : { part: '32 GB DDR4-3600 CL16 (2×16)', note: 'Capacity is set; getting to 3600 CL16 (or enabling XMP) is the one real RAM gain left on AM4.' }
    }
  }
  return {
    component: 'ram',
    impact,
    current: `${gb} GB${single ? ' single-channel' : ''}${speed ? ` @ ${speed} MT/s` : ''}`,
    dropIn: pick,
    overall: pick,
    overallReplatform: false,
  }
}

const IMPACT_ORDER: Record<Impact, number> = { high: 0, medium: 1, low: 2 }

export function buildUpgradePlan(spec: SpecProfile): UpgradePlan {
  const platform = inferPlatform(spec)
  const scores = {
    cpu: cpuScore(spec),
    gpu: gpuScore(spec),
    ram: ramScore(spec, platform),
  }

  const opportunities = [
    cpuOpportunity(spec, platform),
    gpuOpportunity(spec),
    ramOpportunity(spec, platform),
  ]
    .filter((o): o is UpgradeOpportunity => o !== null && (o.dropIn !== null || o.overall !== null))
    .sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact])

  const notes = [
    "We can't read your monitor from Windows — a 240 Hz+ display is the upgrade that helps competitive Fortnite most once the parts below are handled.",
  ]

  const hasHigh = opportunities.some((o) => o.impact === 'high')
  const ceiling = !hasHigh

  if (opportunities.length === 0) {
    return {
      ceiling: true,
      platform,
      headline: 'Your rig is maxed for competitive Fortnite.',
      detail:
        'CPU, GPU and RAM are already top-tier — there is no part upgrade worth buying for this game. Put everything into a high-refresh monitor, dialed settings, and reps.',
      opportunities: [],
      notes,
      scores,
    }
  }

  let headline: string
  let detail: string
  if (hasHigh) {
    const top = opportunities[0]
    const label = { cpu: 'CPU', gpu: 'GPU', ram: 'RAM' }[top.component]
    headline = `Your ${label} is the bottleneck (${top.current}).`
    detail = `This is the upgrade that actually moves your Fortnite frames right now. The rest below are ranked underneath it.`
  } else {
    headline = 'Your rig is competitive-ready — here are the ceiling upgrades.'
    detail = `Nothing here is holding you back, so treat these as optional. They\'re ranked by how much they actually help competitive Fortnite — the top one is the only one worth real money; the rest are polish.`
  }

  return { ceiling, platform, headline, detail, opportunities, notes, scores }
}
