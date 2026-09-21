import type { GameId } from './games'

export interface UpgradeTestGuide {
  scene: string
  metrics: string
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
