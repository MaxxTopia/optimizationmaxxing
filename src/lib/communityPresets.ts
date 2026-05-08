/**
 * Bundled community-curated presets. Hand-built for common rigs,
 * shipped with the app so users have meaningful Custom Preset Builder
 * starting points without needing to import a JSON file from someone else.
 *
 * Adding a new community preset: drop a `.json` file in
 * `resources/community-presets/`, then add the import below.
 */
import laptop from '../../resources/community-presets/laptop-tuning.json'
import igpu from '../../resources/community-presets/igpu-rig.json'
import streamerPlus from '../../resources/community-presets/streamer-plus.json'
import competitiveFps from '../../resources/community-presets/competitive-fps.json'
import calmMode from '../../resources/community-presets/calm-mode.json'
import tournamentFps from '../../resources/community-presets/tournament-fps.json'
import cleanStateGaming from '../../resources/community-presets/clean-state-gaming.json'

export interface CommunityPreset {
  name: string
  tagline: string
  description: string
  tweakIds: string[]
  glyph?: string
}

export const COMMUNITY_PRESETS: CommunityPreset[] = [
  laptop as CommunityPreset,
  igpu as CommunityPreset,
  streamerPlus as CommunityPreset,
  competitiveFps as CommunityPreset,
  calmMode as CommunityPreset,
  tournamentFps as CommunityPreset,
  cleanStateGaming as CommunityPreset,
]
