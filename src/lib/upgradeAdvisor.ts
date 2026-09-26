import type { GameId } from './games'
import type { SpecProfile } from './tauri'

export interface UpgradeTestGuide {
  scene: string
  metrics: string
}

export interface UpgradeRecommendation {
  title: string
  why: string
  parts: string[]
  compatibility: string
  nextStep: string
}

/**
 * Return explainable platform paths from the detected inventory. The native
 * scan does not expose CPU socket/chipset support, so this intentionally names
 * the compatibility checks instead of pretending one exact CPU is guaranteed
 * to fit the current board.
 */
export function getUpgradeRecommendations(spec: SpecProfile): UpgradeRecommendation[] {
  const vendor = `${spec.cpu.vendor} ${spec.cpu.marketing} ${spec.cpu.model}`.toLowerCase()
  const memoryType = spec.ram.modules?.map((module) => module.memoryType).find(Boolean) ?? null
  const memory = memoryType
    ? `Confirm whether the current kit is ${memoryType}; AM5 requires DDR5.`
    : 'Confirm whether the current kit is DDR4 or DDR5; AM5 requires DDR5.'

  if (spec.mobo.isLaptop) {
    return [
      {
        title: 'Laptop platform replacement',
        why: 'Laptop CPU and GPU upgrades are usually not socketed or board-compatible upgrades.',
        parts: ['Compare a newer complete laptop or desktop platform', 'Move storage and peripherals only after checking compatibility'],
        compatibility: 'The scan cannot identify a safe internal CPU upgrade path for this laptop.',
        nextStep: 'Measure the game limit first, then compare a complete replacement against the cost of a desktop upgrade.',
      },
    ]
  }

  if (/intel|genuineintel/.test(vendor)) {
    return [
      {
        title: 'Same-platform Intel CPU upgrade',
        why: 'A faster compatible Intel CPU may be the least disruptive route if the current board and BIOS support it.',
        parts: ['Compatible Intel CPU', 'BIOS update if the board vendor requires it', 'Possibly a stronger cooler or power delivery'],
        compatibility: 'Check the motherboard socket, chipset support list, BIOS version, cooler mount, and power limits. The scan does not expose those socket details yet.',
        nextStep: 'Identify the exact motherboard model and compare its CPU support list before buying anything.',
      },
      {
        title: 'AMD Ryzen X3D platform switch',
        why: 'This is the cross-platform gaming path the old advisor showed: an AMD CPU is a potential route, but it is not a drop-in Intel replacement.',
        parts: ['AMD Ryzen X3D-class CPU', 'AM5 motherboard', 'DDR5 memory', 'Cooler with the correct AM5 mounting hardware'],
        compatibility: `The current Intel motherboard cannot accept an AMD CPU. ${memory} Also check case clearance and PSU connectors.`,
        nextStep: 'Compare the full CPU + motherboard + memory + cooler cost against the measured CPU-limited result in your game.',
      },
    ]
  }

  if (/amd|authenticamd/.test(vendor)) {
    return [
      {
        title: 'Compatible AMD X3D upgrade',
        why: 'A newer gaming-focused AMD CPU may be a drop-in path only when the current socket, board power, and BIOS support it.',
        parts: ['Compatible AMD CPU', 'BIOS update if required', 'Possibly a stronger cooler'],
        compatibility: 'Check the exact socket and motherboard CPU support list. AM4-to-AM5 is a platform change, not a CPU-only swap.',
        nextStep: 'Record the exact motherboard model and socket support, then benchmark the current CPU-limited route before choosing a chip.',
      },
      {
        title: 'Intel platform alternative',
        why: 'A move to Intel is possible, but it is a full platform comparison rather than a drop-in upgrade.',
        parts: ['Intel CPU', 'Compatible Intel motherboard', 'Memory choice that matches that board'],
        compatibility: `The current AMD motherboard cannot accept an Intel CPU. ${memory}`,
        nextStep: 'Compare total platform cost and measured game results, not CPU names in isolation.',
      },
    ]
  }

  return [
    {
      title: 'Platform details needed before recommending a part',
      why: 'The scan did not identify the CPU vendor reliably enough to claim a compatible upgrade.',
      parts: ['Exact CPU model', 'Exact motherboard model and socket', 'Memory type and kit details'],
      compatibility: 'A CPU recommendation without the socket and board support list can lead to an incompatible purchase.',
      nextStep: 'Refresh the hardware scan or enter the exact CPU and motherboard models, then run the controlled game comparison.',
    },
  ]
}

/** Repeatable in-game comparisons; these are test recipes, not performance claims. */
const GAME_TEST_GUIDES: Record<GameId, UpgradeTestGuide> = {
  fortnite: {
    scene: 'Use the same Creative island segment or replay route, game mode, resolution, render mode, cap, and capture setup. Avoid comparing a quiet lobby with a live endgame.',
    metrics: 'Record repeated frame-time captures and 1% lows; note GPU busy/load and per-core CPU behavior. Lower render load as a diagnostic: a consistent gain with GPU saturation points toward a GPU limit, not proof by itself.',
  },
  valorant: {
    scene: 'Repeat the same Practice Range drill with identical agent, bot settings, resolution, cap, and background/capture apps.',
    metrics: 'Compare repeated frame-time captures, 1% lows, GPU load, and per-core CPU behavior. Keep network ping/jitter separate from local render/input latency.',
  },
  cs2: {
    scene: 'Replay the same demo segment or repeat the same workshop benchmark, if installed, with identical settings and capture conditions.',
    metrics: 'Compare repeated frame-time captures and 1% lows; track GPU load and per-core CPU behavior. Do not treat a single benchmark run as a match-performance guarantee.',
  },
  apex: {
    scene: 'Repeat the same Firing Range route with the same legend, weapons, settings, cap, and capture setup.',
    metrics: 'Compare repeated frame-time captures, 1% lows, GPU load, and per-core CPU behavior. Keep server/network variation separate from local frame delivery.',
  },
  warzone: {
    scene: 'Use the same built-in benchmark when available; otherwise repeat the same training/private-match route with unchanged settings and capture setup.',
    metrics: 'Compare repeated frame-time captures and 1% lows, plus GPU load, per-core CPU behavior, and RAM pressure. Public matches add player and server variability.',
  },
  osu: {
    scene: 'Replay the same beatmap, difficulty, mods, skin, audio device, and frame-limit configuration.',
    metrics: 'Compare frame pacing and input/audio consistency across repeated runs. Raw FPS alone does not establish lower input-to-action latency.',
  },
  overwatch: {
    scene: 'Repeat the same hero and Practice Range route with unchanged graphics, frame cap, and capture/background setup.',
    metrics: 'Compare repeated frame-time captures and 1% lows alongside GPU load and per-core CPU behavior; keep network latency separate.',
  },
  'marvel-rivals': {
    scene: 'Repeat the same hero and Practice Range route or the same short custom-match segment with identical graphics, cap, and capture setup.',
    metrics: 'Compare repeated frame-time captures and 1% lows alongside GPU load and per-core CPU behavior; one busy fight is not a controlled hardware comparison.',
  },
}

export function getUpgradeTestGuide(game: GameId): UpgradeTestGuide {
  return GAME_TEST_GUIDES[game]
}
