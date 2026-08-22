export type AstaRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'limit-breaker'

export interface AstaRarityMeta {
  label: string
  minScore: number
  color: string
  accent: string
  flavor: string
}

export const ASTA_RARITIES: Record<AstaRarity, AstaRarityMeta> = {
  common: {
    label: 'Common',
    minScore: 0,
    color: '#d7c7bb',
    accent: '#806b5f',
    flavor: 'The blade is awake. Keep measuring.',
  },
  rare: {
    label: 'Rare',
    minScore: 60,
    color: '#7dd3fc',
    accent: '#075985',
    flavor: 'A clean competitive foundation.',
  },
  epic: {
    label: 'Epic',
    minScore: 75,
    color: '#c4b5fd',
    accent: '#6d28d9',
    flavor: 'The rig is carrying its weight.',
  },
  legendary: {
    label: 'Legendary',
    minScore: 90,
    color: '#fcd34d',
    accent: '#a16207',
    flavor: 'A measured monster on this test setup.',
  },
  'limit-breaker': {
    label: 'Limit Breaker',
    minScore: 98,
    color: '#fda4af',
    accent: '#be123c',
    flavor: 'The ceiling is now the experiment.',
  },
}

export function astaRarityForScore(score: number): AstaRarity {
  if (score >= ASTA_RARITIES['limit-breaker'].minScore) return 'limit-breaker'
  if (score >= ASTA_RARITIES.legendary.minScore) return 'legendary'
  if (score >= ASTA_RARITIES.epic.minScore) return 'epic'
  if (score >= ASTA_RARITIES.rare.minScore) return 'rare'
  return 'common'
}

export function astaRarityMeta(score: number): AstaRarityMeta {
  return ASTA_RARITIES[astaRarityForScore(score)]
}
