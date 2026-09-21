export type GrindKind = 'pro' | 'creator'

export interface GrindResult {
  date: string
  event: string
  placement: string
  context: string
  sourceLabel: string
  sourceUrl: string
}

export interface GrindSnapshot {
  updatedAt: string
  dpi?: string
  pollingHz?: number
  sensitivity?: string
  monitor?: string
  mouse?: string
  keyboard?: string
  controller?: string
  sourceLabel: string
  sourceUrl: string
}

export interface GrindEntry {
  id: string
  name: string
  kind: GrindKind
  summary: string
  profileLabel?: string
  profileUrl?: string
  result?: GrindResult
  snapshot?: GrindSnapshot
}

/** Date the sources on this page were checked; individual records stay dated. */
export const GRIND_LAST_REVIEWED = '2026-09-20'

const DIVISION_1_PRACTICE_WEEK_4_NAC =
  'https://www.fortnite.com/competitive/events/S42_FNCSDivisionalCup_Division1?region=NAC&round=S42_FNCSDivisionalCup_Division1_Week3Final_NAC'
const DIVISION_1_PRACTICE_CURRENT_NAC =
  'https://www.fortnite.com/competitive/events/S42_FNCSDivisionalCup_Division1?region=NAC'
const DIVISION_1_PRACTICE_CURRENT_EU =
  'https://www.fortnite.com/competitive/events/S42_FNCSDivisionalCup_Division1/?region=EU'
const FNCS_LAST_CHANCE_FINAL_NAC =
  'https://www.fortnite.com/competitive/events/S41_FNCSLastChanceMajor/leaderboard?region=NAC&round=S41_FNCSLastChanceMajor_Final_NAC'

export const GRIND_ENTRIES: GrindEntry[] = [
  {
    id: 'peterbot',
    name: 'Peterbot',
    kind: 'pro',
    summary: '2024 FNCS Global Champion with Pollo; current event results are listed separately below.',
    profileLabel: 'ProSettings profile',
    profileUrl: 'https://prosettings.net/players/peterbot/',
    result: {
      date: '2026-09-12',
      event: 'FNCS Division 1 Practice · NAC · Week 4, Round 2',
      placement: '1st with Pollo · 333 points · 6 matches',
      context: 'One practice round, not a season or Major ranking.',
      sourceLabel: 'Epic Games event results',
      sourceUrl: DIVISION_1_PRACTICE_WEEK_4_NAC,
    },
    snapshot: {
      updatedAt: '2026-08-31',
      dpi: '800',
      pollingHz: 1000,
      sensitivity: '6.4% X / 6.4% Y · target/scope 45%',
      monitor: 'ZOWIE XL2566K',
      mouse: 'Logitech G PRO X2 SUPERSTRIKE · Lunar Eclipse',
      keyboard: 'SteelSeries Apex Pro TKL Gen 3',
      sourceLabel: 'ProSettings · Aug 31, 2026',
      sourceUrl: 'https://prosettings.net/players/peterbot/',
    },
  },
  {
    id: 'veno',
    name: 'Veno',
    kind: 'pro',
    summary: 'Fortnite competitor; roster labels can change, so this page avoids treating one event tag as a permanent team.',
    profileLabel: 'ProSettings profile',
    profileUrl: 'https://prosettings.net/players/veno/',
    result: {
      date: '2026-08-14',
      event: 'FNCS Global Championship Last Chance · NAC',
      placement: '3rd with GEN Aj · 286 points · 6 matches',
      context: 'Official final-round placement; not a current power ranking.',
      sourceLabel: 'Epic Games event results',
      sourceUrl: FNCS_LAST_CHANCE_FINAL_NAC,
    },
    snapshot: {
      updatedAt: '2026-08-10',
      dpi: '800',
      pollingHz: 1000,
      sensitivity: '6.3% X / 6.3% Y · target/scope 45%',
      monitor: 'ZOWIE XL2566K',
      mouse: 'Razer Viper V3 Pro · Black',
      keyboard: 'SteelSeries Apex Pro TKL Gen 3 · Black',
      sourceLabel: 'ProSettings · Aug 10, 2026',
      sourceUrl: 'https://prosettings.net/players/veno/',
    },
  },
  {
    id: 'aussie-antics',
    name: 'Aussie Antics',
    kind: 'creator',
    summary: 'Fortnite creator and event analyst. No player ranking or training routine is inferred.',
    profileLabel: 'Dignitas profile',
    profileUrl: 'https://dignitas.gg/player/aussieantics',
  },
  {
    id: 'epikwhale',
    name: 'EpikWhale',
    kind: 'pro',
    summary: 'Fortnite competitor; the dated result below is an official event placement, not a current ranking.',
    result: {
      date: '2026-08-14',
      event: 'FNCS Global Championship Last Chance · NAC',
      placement: '19th with pxmp · 154 points · 6 matches',
      context: 'Official final-round placement; not a current power ranking.',
      sourceLabel: 'Epic Games event results',
      sourceUrl: FNCS_LAST_CHANCE_FINAL_NAC,
    },
    profileLabel: 'Epic Games event results',
    profileUrl: FNCS_LAST_CHANCE_FINAL_NAC,
  },
  {
    id: 'mongraal',
    name: 'Mongraal',
    kind: 'creator',
    summary: 'Former professional player and creator. The equipment below is a dated profile snapshot, not a current recommendation.',
    profileLabel: 'ProSettings profile',
    profileUrl: 'https://prosettings.net/players/mongraal/',
    snapshot: {
      updatedAt: '2026-08-31',
      dpi: '1600',
      pollingHz: 1000,
      sensitivity: '3.2% X / 3.2% Y · ADS 27.5%',
      monitor: 'ASUS ROG Swift Pro PG248QP',
      mouse: 'Razer Viper V3 Pro · Black',
      keyboard: 'SteelSeries Apex Pro Mini · White Gold',
      sourceLabel: 'ProSettings · Aug 31, 2026',
      sourceUrl: 'https://prosettings.net/players/mongraal/',
    },
  },
  {
    id: 'clix',
    name: 'Clix',
    kind: 'pro',
    summary: 'Fortnite competitor; current team status is not inferred from a past roster listing.',
    profileLabel: 'ProSettings profile',
    profileUrl: 'https://prosettings.net/players/clix/',
    result: {
      date: '2026-09-19',
      event: 'FNCS Division 1 Practice · NAC · Week 5, Round 2',
      placement: '5th with Twis Rapid · 225 points · 4 matches',
      context: 'One practice round; this result shows four matches, not a season or Major ranking.',
      sourceLabel: 'Epic Games event results',
      sourceUrl: DIVISION_1_PRACTICE_CURRENT_NAC,
    },
    snapshot: {
      updatedAt: '2026-08-31',
      dpi: '800',
      pollingHz: 1000,
      sensitivity: '8.7% X / 6.3% Y · target 60% / scope 35%',
      monitor: 'Alienware AW2523HF',
      mouse: 'Finalmouse ULX · Sakura',
      keyboard: 'SteelSeries Apex Pro Mini · Black',
      sourceLabel: 'ProSettings · Aug 31, 2026',
      sourceUrl: 'https://prosettings.net/players/clix/',
    },
  },
  {
    id: 'reet',
    name: 'Reet',
    kind: 'pro',
    summary: 'Competitive Fortnite player; ProSettings listed him as a free agent on Aug 31, 2026.',
    profileLabel: 'ProSettings profile',
    profileUrl: 'https://prosettings.net/players/reet/',
    result: {
      date: '2026-08-14',
      event: 'FNCS Global Championship Last Chance · NAC',
      placement: '13th with Cooper · 192 points · 6 matches',
      context: 'Event placement; not a current power ranking.',
      sourceLabel: 'Epic Games event results',
      sourceUrl: FNCS_LAST_CHANCE_FINAL_NAC,
    },
    snapshot: {
      updatedAt: '2026-08-31',
      dpi: '800',
      pollingHz: 1000,
      sensitivity: '6.4% X / 6.4% Y · target/scope 58.9%',
      monitor: 'Alienware AW2518H',
      mouse: 'Logitech G PRO X SUPERLIGHT 2',
      keyboard: 'SteelSeries Apex Pro Mini',
      controller: 'SCUF Reflex is separately listed controller gear',
      sourceLabel: 'ProSettings · Aug 31, 2026',
      sourceUrl: 'https://prosettings.net/players/reet/',
    },
  },
  {
    id: 'bugha',
    name: 'Bugha',
    kind: 'pro',
    summary: '2019 Fortnite World Cup Solo champion. This page does not infer current roster status from an older profile.',
    profileLabel: 'ProSettings profile',
    profileUrl: 'https://prosettings.net/players/bugha/',
    result: {
      date: '2026-08-31',
      event: 'FNCS Division 5 Practice · NAC · Week 2, Round 2',
      placement: '4th with Cooper · 369 points · 9 matches',
      context: 'One practice round, not a Major or overall season ranking.',
      sourceLabel: 'Epic Games event results',
      sourceUrl: 'https://www.fortnite.com/competitive/events/S42_FNCSDivisionalCup_Division5?region=NAC',
    },
    snapshot: {
      updatedAt: '2025-09-15',
      dpi: '800',
      pollingHz: 1000,
      sensitivity: '6.4% X / 6.4% Y · target/scope 45%',
      monitor: 'Alienware AW2521H',
      mouse: 'Razer Viper V3 Pro · Black',
      keyboard: 'SteelSeries Apex Pro Mini · Black',
      sourceLabel: 'ProSettings · Sep 15, 2025',
      sourceUrl: 'https://prosettings.net/players/bugha/',
    },
  },
  {
    id: 'khanada',
    name: 'Khanada',
    kind: 'pro',
    summary: 'Fortnite competitor; the result below is one practice round, not a season ranking.',
    profileLabel: 'Epic Games event results',
    profileUrl: DIVISION_1_PRACTICE_WEEK_4_NAC,
    result: {
      date: '2026-09-12',
      event: 'FNCS Division 1 Practice · NAC · Week 4, Round 2',
      placement: '3rd with ark2x · 264 points · 6 matches',
      context: 'One practice round, not a season or Major ranking.',
      sourceLabel: 'Epic Games event results',
      sourceUrl: DIVISION_1_PRACTICE_WEEK_4_NAC,
    },
  },
  {
    id: 'th0mashd',
    name: 'Th0masHD',
    kind: 'pro',
    summary: 'Fortnite competitor; the linked settings snapshot is from February 2026.',
    profileLabel: 'ProSettings profile',
    profileUrl: 'https://prosettings.net/players/th0mashd/',
    result: {
      date: '2026-09-19',
      event: 'FNCS Division 1 Practice · EU · Week 5, Round 2',
      placement: '6th with FocusHD · 275 points · 6 matches',
      context: 'One practice round, not a season or Major ranking.',
      sourceLabel: 'Epic Games event results',
      sourceUrl: DIVISION_1_PRACTICE_CURRENT_EU,
    },
    snapshot: {
      updatedAt: '2026-02-23',
      dpi: '1600',
      pollingHz: 1000,
      sensitivity: '5.0% X / 3.0% Y · target/scope 37%',
      monitor: 'ZOWIE XL2411T',
      mouse: 'Logitech G PRO X SUPERLIGHT · White',
      keyboard: 'SteelSeries Apex Pro TKL (2023)',
      sourceLabel: 'ProSettings · Feb 23, 2026',
      sourceUrl: 'https://prosettings.net/players/th0mashd/',
    },
  },
]
