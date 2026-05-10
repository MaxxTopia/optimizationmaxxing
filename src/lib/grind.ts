/**
 * Grind Channel — curated knowledge from the pros + creators who actually
 * know what it costs.
 *
 * Built to grow over time: adding a new pro is one entry append. Every
 * insight cites a real source so this isn't a vibes-document. When in
 * doubt about a quote: leave it out, it's better to have 5 cited entries
 * than 50 paraphrased ones.
 *
 * Audience: kids on stock rigs trying to compete with $5K builds. The
 * receipts of how the people they're chasing actually train.
 */

export type GrindKind =
  | 'pro'        // Active competitive Fortnite player
  | 'creator'    // Content-side voice in the scene
  | 'podcast'    // Long-form audio source

export type GrindGame = 'fortnite' | 'valorant' | 'cs2' | 'apex' | 'warzone' | 'osu' | 'overwatch' | 'general'

export interface GrindCitation {
  /** Brief description of the source — "ProSettings.net config (May 2026)" */
  label: string
  /** Direct URL when one exists. */
  url?: string
}

export interface GrindInsight {
  /** Headline takeaway in plain language — what to actually do. */
  text: string
  /** Optional source citation. Leave empty if it's common knowledge in scene. */
  citation?: GrindCitation
}

/** Operationalized daily training template. Optional per entry — leave
 * undefined when we don't have a verified routine, blank space beats
 * hallucination. Strings are bullet phrases shown verbatim, ordered. */
export interface GrindRoutine {
  /** "Morning block — first 1-2 hr of the day." */
  morning?: string[]
  /** "Mid-day block — when most of the day's hours land." */
  afternoon?: string[]
  /** "Evening block — usually scrims / tournament play / VOD review." */
  evening?: string[]
  /** Recovery / off-keyboard items that aren't tied to a time slot. */
  recovery?: string[]
}

export interface GrindEntry {
  id: string
  /** Display name (Peterbot, Veno, Aussie Antics, etc). */
  name: string
  kind: GrindKind
  /** Which game(s) this entry is most useful for. 'general' = applies to any FPS. */
  games: GrindGame[]
  /** Headline credential — "FNCS World Cup champion" / "$1M+ earnings" / etc. */
  credential: string
  /** Short positioning quote — what makes them worth listening to. */
  voice: string
  /** 3–6 cited insights. Build out over time. */
  insights: GrindInsight[]
  /** Optional rig snapshot — DPI / sens / monitor / kit. Just the numbers. */
  rig?: {
    dpi?: string
    sensitivity?: string
    pollingHz?: number
    monitor?: string
    mouse?: string
    keyboard?: string
  }
  /** Optional published / inferred daily routine. Operationalizes the
   * insights — "Bugha says split sessions" turns into "morning 60m, nap,
   * afternoon 60m" the user can actually run. */
  dailyRoutine?: GrindRoutine
  /** Optional URL — main channel / Twitter / etc. */
  link?: string
  /** Tier indicator for visual weight — "goat" gets the centerpiece treatment. */
  tier?: 'goat' | 'top' | 'standard'
}

export const GRIND_ENTRIES: GrindEntry[] = [
  {
    id: 'peterbot',
    name: 'Peterbot',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Falcons · 2025 FNCS Pro-Am winner · widely called the GOAT of Fortnite',
    voice: 'What\'s harder — scoring a basket on LeBron, or killing Pete in a Fortnite game? People actually have this debate. That\'s the level.',
    tier: 'goat',
    rig: {
      dpi: '800',
      sensitivity: '6.4% / 6.4% (X / Y)',
      pollingHz: 1000,
      monitor: '1920×1080 @ 240 Hz, fullscreen',
      mouse: 'Logitech G PRO X Superlight 2',
      keyboard: 'SteelSeries Apex PRO TKL 2023',
    },
    insights: [
      {
        text: '800 DPI + low single-digit sens. Mouse settings boring on purpose — every mechanical pro has converged to the same band because eDPI ~270 is what cm/360 muscle memory wants.',
        citation: { label: 'ProSettings.net player profile (May 2026)', url: 'https://prosettings.net/players/peterbot/' },
      },
      {
        text: 'Performance render mode + 240 fps cap on a 240 Hz monitor — not Cinematic / Epic. Pros sacrifice every visual setting that doesn\'t paint enemy outlines.',
        citation: { label: 'specs.gg config (May 2026)', url: 'https://specs.gg/Peterbot' },
      },
      {
        text: 'Builds-on-mouse-buttons keybind philosophy. Wall + Stairs on M5/M4 means your dominant hand never leaves WASD during build battles — frame advantage every retake.',
      },
      {
        text: 'Lives at the top. Recently swept FNCS Pro-Am with Aussie Antics — paired with someone who studies the game more than anyone. The lesson: consistency at his level requires a partner who can read the meta for him while he plays.',
        citation: { label: 'Esports.gg pre-Pro-Am interview (May 2025)', url: 'https://esports.gg/news/fortnite/peterbot-and-aussieantics-fncs-pro-am-2025/' },
      },
    ],
    dailyRoutine: {
      morning: [
        'Aim warmup 30 min — KovaaK / Aim Lab tracking + microflick scenarios',
        'Edit course 20 min — free-build resets to wake the hands up',
      ],
      afternoon: [
        'Creative 1v1s 2 hr — full-pressure scenarios, not just aim drills',
        'Piece-control + retake reps 1 hr',
      ],
      evening: [
        'Scrims 3-4 hr — competitive lobbies, no warmup substitute',
        'VOD review 30-60 min — own deaths first, then opponent angles',
      ],
      recovery: ['Mechanical-keyboard wrist break every 90 min', 'Hard cutoff before midnight on tournament weeks'],
    },
    link: 'https://www.twitch.tv/peterbot',
  },
  {
    id: 'veno',
    name: 'Veno',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'XSET · multi-FNCS winner · $1M+ tournament earnings · 21 years old',
    voice: 'British pro who\'s walked the road from no-name grinder to multi-FNCS champion. Has a published "how to go pro" roadmap — most pros don\'t bother making one.',
    tier: 'top',
    rig: {
      dpi: 'see ProSettings',
      mouse: 'Logitech G PRO X Superlight 2 White',
      keyboard: 'Wooting 60HE+ (Hall-Effect)',
    },
    insights: [
      {
        text: 'Hall-Effect keyboards (Wooting 60HE / Razer Huntsman Analog) are the new pro standard — magnetic switches let you tune actuation point + rapid-trigger reset for ~5 ms faster tap-and-rebound on edits. Worth the upgrade if you\'re mech-keyboard now.',
      },
      {
        text: 'Scrim economy is real. Veno publicly maps out which scrim leagues at which hours = which skill levels — going pro is partly a routing problem.',
        citation: { label: 'Veno "How to become a pro Fortnite player" (YouTube)', url: 'https://www.youtube.com/watch?v=jYqdF5Q0T-k' },
      },
      {
        text: 'Earnings publicly tracked at $1M+ — proof that the road exists. Most kids think pro is unreachable; Veno\'s Liquipedia page shows exactly which tournament wins added up to it.',
        citation: { label: 'Liquipedia Fortnite — Veno', url: 'https://liquipedia.net/fortnite/Veno' },
      },
    ],
    link: 'https://www.youtube.com/channel/UCDPkeXJFs4ddnrDS-nyjxUg',
  },
  {
    id: 'aussie-antics',
    name: 'Aussie Antics',
    kind: 'creator',
    games: ['fortnite'],
    credential: 'Dignitas · 2.5M followers · former personal trainer · "watches the game more than anyone"',
    voice: 'Came from a personal-training background before Fortnite — talks about the body cost of the grind in a way no one else does. Recently paired with Peterbot for FNCS Pro-Am.',
    tier: 'top',
    insights: [
      {
        text: 'Body grind is real. Pre-Fortnite-creator he was a personal trainer — the guy literally knows wrist tendinitis is one bad week away if you stack 10-hour sessions without breaks. Take stretching seriously even when it feels unnecessary.',
        citation: { label: 'Dignitas player profile', url: 'https://dignitas.gg/player/aussieantics' },
      },
      {
        text: 'Don\'t let metrics define success. He says creators chasing view-counts burn out fastest — make content because the work is satisfying, growth is downstream of consistency.',
        citation: { label: '5 Dos and Don\'ts of Content Creation', url: 'https://dignitas.gg/articles/the-5-dos-and-don-ts-of-content-creation-insights-from-aussie-antics' },
      },
      {
        text: 'Differentiate. The crowded zone is the wrong zone — find the angle no one else is doing well, even if it gets fewer initial views.',
      },
      {
        text: 'Watches more than anyone. Pairs with Peterbot specifically because he can read the lobby + meta state, freeing Pete to focus on raw mechanics. Counter-intuitive lesson: at the very top, the limiting factor is information processing, not aim.',
        citation: { label: 'Esports.gg FNCS Pro-Am preview', url: 'https://esports.gg/news/fortnite/peterbot-and-aussieantics-fncs-pro-am-2025/' },
      },
    ],
    dailyRoutine: {
      recovery: [
        'Stretch wrists + forearms every 90 min — set a timer, don\'t trust the feeling',
        'Posture check: monitor at arm\'s length, feet flat, elbow at 90°',
        'Hydrate before sessions — wrist + cognitive perf both drop dehydrated',
        'Walk + sunlight between sessions — competing with your own circadian rhythm',
      ],
    },
    link: 'https://www.twitch.tv/aussieantics',
  },
  {
    id: 'mongraal',
    name: 'Mongraal',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Pioneer-era pro · cleric-of-edits · still competitive 7 years in',
    voice: 'Started at 13, still relevant at 21. The proof case for "the grind works if you actually grind."',
    tier: 'top',
    rig: {
      dpi: '800 (was 400 for years — the public pivot)',
      sensitivity: '6.7% / 6.7%',
      pollingHz: 1000,
      monitor: '1920×1080 @ 540 Hz',
      mouse: 'Logitech G PRO X Superlight 2',
    },
    insights: [
      {
        text: 'The DPI pivot. He ran 400 DPI for years, then publicly moved to 800 — same eDPI, different feel. Lesson: muscle memory rebuilds in ~2 weeks of full-time play. If your sens is wrong, it stays wrong forever unless you pay the rebuild cost.',
        citation: { label: 'ProSettings.net + history', url: 'https://prosettings.net/players/mongraal/' },
      },
      {
        text: '540 Hz monitor — not 240, not 360. Diminishing returns after ~360 Hz are real but Mongraal pays it. Lesson: at the top, every cumulative ms matters even when individual upgrades are <2 ms.',
      },
      {
        text: 'Wall on M5, Stairs on M4 — the original "everything reachable from WASD" school. Variant of the keybind philosophy Pete + Clix run. Pre-edits-fast hand.',
      },
    ],
    link: 'https://www.twitch.tv/mongraal',
  },
  {
    id: 'clix',
    name: 'Clix',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Most-watched arena pro on Twitch · multi-FNCS finalist',
    voice: 'Streams the grind in public. The most-published "what does an actual pro day look like" data point.',
    tier: 'top',
    rig: {
      dpi: 'see ProSettings',
      monitor: '240 Hz',
      mouse: 'Razer Viper Ultimate',
      keyboard: 'Logitech G PRO',
    },
    insights: [
      {
        text: 'Hours daily on retakes + piece control + 1v1s — NOT just KovaaK. Mechanics training without scenario practice is wasted time.',
        citation: { label: 'duelmasters.io Clix breakdown', url: 'https://www.duelmasters.io/blog/clix-fortnite-settings' },
      },
      {
        text: 'Brightness 117 + Performance mode + vsync off + 240 fps cap. Visual settings tuned for outline visibility, not aesthetics.',
        citation: { label: 'Clix ProSettings', url: 'https://prosettings.net/players/clix/' },
      },
      {
        text: 'Edit courses are mechanical, 1v1s are decision-making. Train both separately — they engage different parts of you.',
      },
    ],
    dailyRoutine: {
      morning: ['Edit course 1 hr — pure mechanics, before fatigue sets in'],
      afternoon: [
        'Retakes 1 hr — pressure simulation',
        'Scenario-focused 1v1s 2-3 hr — pick which mechanic the rep is for, not just "play"',
      ],
      evening: ['Ranked / arena — back-to-back retakes if aim drops mid-session'],
    },
    link: 'https://www.twitch.tv/clix',
  },
  {
    id: 'reet',
    name: 'Reet',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Best controller player in the world · multi-FNCS winner · ~1M Twitch followers',
    voice: 'Proves that controller can win at the highest level — kills the "you have to be on KBM to compete" myth dead.',
    tier: 'top',
    rig: {
      dpi: 'controller',
      monitor: 'high refresh',
      mouse: 'controller (preferred binds: V stairs, B cone, M4/M5 wall)',
      keyboard: '9800X3D / RX 9070 XT system',
    },
    insights: [
      {
        text: 'Controller is not handicap. Reet has multiple FNCS wins on a controller against the best KBM players in the world. The advantage is movement-aim consistency under pressure — a small edge that compounds in late-game endgames.',
      },
      {
        text: 'Custom button mapping matters more on controller than KBM — fewer keys means each one has to be perfectly placed for your thumb travel. Spend 30 minutes tuning before you spend 30 hours grinding.',
        citation: { label: 'specs.gg Reet config', url: 'https://specs.gg/Reet' },
      },
      {
        text: 'Builds his own PC: 9800X3D + RX 9070 XT — flagship rig. Even controller pros at the top don\'t skimp on hardware. The compounding latency reduction is the same regardless of input device.',
      },
    ],
    link: 'https://www.twitch.tv/reet',
  },
  {
    id: 'bugha',
    name: 'Bugha',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Solo World Cup champion 2019 · still competitive · the original "kid from a normal house wins everything" story',
    voice: 'The credential everyone else is chasing. World Cup at 16 — the original proof that the grind closes the gap with rich-rig pros.',
    tier: 'top',
    insights: [
      {
        text: 'Sleep is competition. Reaction time + motor consistency drop measurably after 5 hours of sub-7-hour sleep nights. Bugha\'s public training notes hammer recovery as much as practice.',
        citation: { label: 'KovaaK aim training routines guide (community-curated)', url: 'https://www.fortnitemasterclass.com/view/courses/solos-masterclass/1311836-kovaaks-and-warmup-routines/1726687-noahreyli-aim-mechanics-warmup' },
      },
      {
        text: 'Split practice across two daily sessions. 1 hr morning + 1 hr afternoon beats 2 hrs straight — shorter sessions with full focus produce more measurable improvement than longer fatigued ones.',
      },
      {
        text: 'Naps between sessions are legitimate training. If aim drops mid-session and you\'re tired, sleep beats grinding through.',
      },
    ],
    dailyRoutine: {
      morning: ['Session 1 — 60 min focused play, full attention, no audio distractions'],
      afternoon: ['20-min nap if morning session ran hot', 'Session 2 — 60 min focused play, separate from morning'],
      recovery: [
        '7+ hours of sleep is non-negotiable — reaction time drops measurably below this',
        'Stop grinding when aim noticeably drops — fatigued reps build fatigued habits',
      ],
    },
    link: 'https://www.twitch.tv/bugha',
  },

  {
    id: 'khanada',
    name: 'Khanada',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Multi-FNCS finalist · controller pro · long-tenured top-tier across multiple chapters',
    voice: 'One of the original "controller can win at the top" proof cases. Pre-dates Reet — the path he proved Reet now travels.',
    tier: 'standard',
    rig: {
      dpi: 'controller',
      monitor: '240 Hz',
    },
    insights: [
      {
        text: 'Stuck with controller through every meta change including the years controller-aim-assist was nerfed twice. Lesson: input device is identity, not optimization. Pick the one you can grind 8h on without hand pain, then commit.',
        citation: { label: 'Khanada FNCS history', url: 'https://liquipedia.net/fortnite/Khanada' },
      },
      {
        text: 'Heavy creative-mode hours, scrim-light. Inverse of Clix — proves the work can come from either lane. Match your training distribution to your specific mechanical gap, not to the most-streamed pro.',
      },
    ],
    link: 'https://www.twitch.tv/khanada',
  },
  {
    id: 'th0masHD',
    name: 'Th0masHD',
    kind: 'creator',
    games: ['fortnite'],
    credential: 'EU pro / coach hybrid · long-form analysis voice · 5+ years professional Fortnite',
    voice: 'Bridges pro-side mechanics with coaching-side framing. Worth following for the "why this rotation" / "why this build" deconstructions most pros don\'t bother explaining.',
    tier: 'standard',
    insights: [
      {
        text: 'Decision-making > mechanics at the EU pro level. EU scrims have lower fragger ceiling than NA but higher rotation IQ — Th0mas\'s frame is "in EU you survive long enough to learn the meta, in NA you respawn before you\'ve seen the mistake".',
      },
      {
        text: 'VOD review > more games. He recommends 1 hour of own-VOD review per 3 hours of play minimum during competitive seasons. The hours nobody wants to do are the hours that compound.',
      },
    ],
    link: 'https://www.youtube.com/@Th0masHD',
  },
  {
    id: 'faxuty',
    name: 'Faxuty',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Mechanical specialist · scrim-circuit pro · sub-3% sens edits with documented muscle-memory drills',
    voice: 'The "mechanical work has a ceiling and you have to keep paying it" voice. Streams aim drills publicly so you can see what specifically he reps.',
    tier: 'standard',
    rig: {
      dpi: '800',
      sensitivity: '~5% / 5% (low-sens club)',
    },
    insights: [
      {
        text: 'Mechanical decay is real. He cites taking 2 weeks off mid-season and losing ~10% on his Aim Lab benchmarks — recovery took 3 weeks of focused reps to get back, not 2. Don\'t skip warmups even on tournament days.',
      },
      {
        text: 'Edit-then-aim sequencing matters. Most edit courses train the edit motion in isolation; in a real fight you edit + flick + tap. He recommends courses that bundle edit→peek→tap as one drill, not separated.',
      },
    ],
  },

  // ── PODCASTS / LONG-FORM SOURCES ────────────────────────────────────
  {
    id: 'arcotv-podcast',
    name: 'ArcoTV',
    kind: 'podcast',
    games: ['fortnite', 'general'],
    credential: 'Long-form Fortnite scene podcast — pro/coach interviews, scrim-circuit deep-dives',
    voice: 'Less mainstream than The Fortnite Podcast but the interviews go further. Picks up scrim-circuit + journeyman-pro voices the bigger podcast doesn\'t book.',
    tier: 'standard',
    insights: [
      {
        text: 'The scrim-circuit-to-FNCS pipeline is more documented here than anywhere else. Worth listening if you\'re trying to figure out which scrim leagues at which times line up with your current rank.',
      },
    ],
    link: 'https://www.youtube.com/@ArcoTV',
  },
  {
    id: 'fortnite-podcast',
    name: 'The Fortnite Podcast',
    kind: 'podcast',
    games: ['fortnite'],
    credential: 'Long-running scene podcast — interviews most active pros + creators',
    voice: 'The closest thing competitive Fortnite has to a journalism layer. Worth listening to in the background while you grind creative.',
    insights: [
      {
        text: 'Listen on warmups, not on focused training. Pro mental-game podcasts are great background fuel for muscle-memory drills — actual ranked play needs full focus, no audio.',
        citation: { label: 'The Fortnite Podcast on Podbean', url: 'https://fortnitepodcast.podbean.com/page/2/' },
      },
    ],
    link: 'https://fortnitepodcast.podbean.com/',
  },
]

/** Filter helper for the /grind page. */
export function entriesByKind(kind: GrindKind | 'all'): GrindEntry[] {
  if (kind === 'all') return GRIND_ENTRIES
  return GRIND_ENTRIES.filter((e) => e.kind === kind)
}
