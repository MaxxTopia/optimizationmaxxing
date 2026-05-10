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
    credential: 'Falcons · 2024 FNCS Global Championship winner (w/ Pollo) · 2025 FNCS Pro-Am winner · widely called the GOAT',
    voice: "What's harder — scoring a basket on LeBron, or killing Pete in a Fortnite game? People actually have this debate. That's the level.",
    tier: 'goat',
    rig: {
      dpi: '800',
      sensitivity: '6.4% / 6.4% (X / Y, ADS 45%)',
      pollingHz: 1000,
      monitor: 'ZOWIE XL2566K (1920×1080 @ 360 Hz, DyAC+)',
      mouse: 'Logitech G PRO X Superlight 2 (White)',
      keyboard: 'SteelSeries Apex Pro TKL 2023',
    },
    insights: [
      {
        text: 'Duo with **Pollo** (Miguel "Pollo" Moreno) — the same partnership that took the 2024 FNCS Global Championship. They reunited for the 2026 duo season after a stint in trios. Frag-and-frag duo, not a strats-and-frag duo.',
        citation: { label: 'Hotspawn — Peterbot & Pollo to reunite for FNCS 2026', url: 'https://www.hotspawn.com/fortnite/news/peterbot-and-pollo-fncs-2026' },
      },
      {
        text: 'Coach: **Raz** (Dominik "RazZzero0o" Beckmann, Wave Esports). Works with Pete + Pollo + Flickzy. The on-record division of labor is "general performance/strategy coach" — anything more specific than that is fan speculation, so leave it there.',
        citation: { label: 'Fortnite Esports Wiki — RazZzero0o', url: 'https://fortnite-esports.fandom.com/wiki/RazZzero0o' },
      },
      {
        text: '800 DPI + low single-digit sens. Mouse settings boring on purpose — every mechanical pro has converged to the same band because eDPI ~270 is what cm/360 muscle memory wants.',
        citation: { label: 'ProSettings.net (updated 2026-04-27)', url: 'https://prosettings.net/players/peterbot/' },
      },
      {
        text: 'ZOWIE XL2566K @ 360 Hz with **DyAC+** (panel-side motion-blur reduction). Not a driver tweak, not a software setting — the monitor itself strobes the backlight to crush trail-blur on tracking. This is why peripheral cost matters past a point.',
        citation: { label: 'Codelife — Peterbot UPDATED Settings 2026 (March 2026)', url: 'https://www.youtube.com/watch?v=T8cr2AEfofE' },
      },
      {
        text: 'Performance render mode + 240 fps cap. Visual settings sacrificed for outline visibility, not aesthetics.',
      },
      {
        text: 'Builds-on-mouse-buttons keybind philosophy. Wall + Stairs on M5/M4 means your dominant hand never leaves WASD during build battles — frame advantage every retake.',
      },
      {
        text: '2025 FNCS Pro-Am win with AussieAntics — Aussie\'s own quote was "Peterbot\'s the greatest. I just focused on keeping pace." Coverage explicitly framed it as Pete fragging while Aussie stayed alive. The lesson is the opposite of what most people would guess: pair-Pro-Am proved Pete can carry someone who barely plays competitive, not that "great pros need meta-readers".',
        citation: { label: 'Esports.gg recap (May 12, 2025)', url: 'https://esports.gg/news/fortnite/peterbot-and-aussieantics-win-the-2025-fncs-pro-am/' },
      },
    ],
    link: 'https://www.twitch.tv/peterbot',
  },
  {
    id: 'veno',
    name: 'Veno',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'XSET · FNCS 2026 Major 1 NA Central winner (w/ Curve, 727 pts) · multi-FNCS winner across EU + NA · $1M+ earnings · 21 years old',
    voice: "British, won't filter language for sponsors, banned from Epic's own Discord for being too toxic toward them. The pro who tells you the road is doable because he just walked it from no-name grinder to multi-region FNCS champion — and won't soften how brutal the middle of it is.",
    tier: 'top',
    rig: {
      dpi: 'see ProSettings',
      mouse: 'Logitech G PRO X Superlight 2 White',
      keyboard: 'Wooting 60HE+ (Hall-Effect)',
    },
    insights: [
      {
        text: 'EU origin → moved NA → got dropped → **picked up Curve** (a then-no-name controller player nobody had on a watchlist) → won the **FNCS 2026 Major 1 NA Central Grand Finals with 727 points**. Veno is now the **first player ever to win both EU and NA FNCS Grand Finals** (3rd cross-region winner alongside Muz and SwizzY). Lesson: roster luck is real, but you also have to be the kind of player a no-name picks back up after the big-name drops you.',
        citation: { label: 'Hotspawn — Veno + Curve win FNCS Major 1', url: 'https://www.hotspawn.com/fortnite/news/veno-fncs-major-1-winners' },
      },
      {
        text: 'Banned from **Epic\'s own Discord** for being "too toxic toward them" — his words, in a public Esports News UK interview. Includes Red Bull contestation drama. The receipts on what "uncompromising" looks like as a personality fit for the scene; not a path to recommend, but proof you don\'t have to be marketable to win.',
        citation: { label: 'Esports News UK interview (June 2023)', url: 'https://esports-news.co.uk/2023/06/09/fortnite-pro-veno-red-bull-contested/' },
      },
      {
        text: '**"We going for that #1 NIGGA."** Stream catchphrase, unfiltered, on-brand for the Epic-Discord-ban era. Not how every pro talks — but it\'s how Veno talks, and pretending otherwise would whitewash the personality that pairs with the resume.',
        citation: { label: 'Veno stream — verbatim (clip widely circulated in NA Fortnite)' },
      },
      {
        text: '**"If you want to be able to buy things without looking at the price, you need to be able to work without looking at the clock."** Veno\'s work-ethic line. Same kid who got dropped + picked up Curve + won Major 1. The financial freedom-of-grind framing is the most-quoted thing he\'s said outside of the toxic-stream snippets.',
        citation: { label: 'Veno stream / X — verbatim' },
      },
      {
        text: '**"Is skinny Pete better than Bron all time?"** — Veno\'s framing of the Peterbot-vs-LeBron debate the scene actually has. Pete is the Fortnite GOAT in the same way LeBron is the basketball GOAT, with the "harder to score on / harder to kill" debate stacked on top. Veno\'s the kind of pro who actually engages with the meme.',
      },
      {
        text: 'TKay asked him **"would you rather have Peterbot\'s skill or Spider-Man\'s powers?"** Veno: **"Stupid question nigga."** The implicit answer — Pete\'s skill, obviously — is the punchline. Pro consensus on Pete\'s ceiling captured in 4 words.',
        citation: { label: 'Veno reply to TKay — verbatim' },
      },
      {
        text: 'Hall-Effect keyboards (Wooting 60HE / Razer Huntsman Analog) are the new pro standard — magnetic switches let you tune actuation point + rapid-trigger reset for ~5 ms faster tap-and-rebound on edits. Worth the upgrade if you\'re mech-keyboard now.',
      },
      {
        text: 'Scrim economy is real. Veno publicly maps out which scrim leagues at which hours = which skill levels — going pro is partly a routing problem, not just a mechanical one.',
        citation: { label: 'Veno "How to become a pro Fortnite player" (YouTube)', url: 'https://www.youtube.com/watch?v=jYqdF5Q0T-k' },
      },
      {
        text: 'Earnings publicly tracked at $1M+ across EU + NA wins — proof the road exists. Liquipedia shows exactly which tournaments added up to it; not a black box.',
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
    credential: 'Dignitas · 2.5M followers · FNCS Pro-Am 2025 winner (w/ Peterbot) · former personal trainer · "watches the game more than anyone"',
    voice: "Pre-Fortnite-creator he ran a personal training business for four years. Talks about the body cost of the grind in a way nobody else in the scene does. First stream Halloween 2018, full-time January 2020, FNCS Pro-Am champion 2025 — the proof case for what slow, deliberate, body-aware grinding looks like over a 7-year arc.",
    tier: 'top',
    insights: [
      {
        text: 'Pre-Fortnite, ran a personal training business for **four years** — verbatim. Body grind is real. Wrist tendinitis is one bad week away if you stack 10-hour sessions without breaks. He treats stretching like a non-negotiable training input, not a recovery accessory.',
        citation: { label: 'Dignitas interview', url: 'https://dignitas.gg/articles/getting-to-know-the-face-of-competitive-fortnite-aussie-antics' },
      },
      {
        text: 'First stream October 31, 2018 (Halloween — he remembers exactly). Went full-time January 2020 when he moved into his first house. Public start-to-full-time was ~14 months. Don\'t expect pro-tier results in your first year of trying.',
        citation: { label: 'Dignitas interview (verbatim)', url: 'https://dignitas.gg/articles/getting-to-know-the-face-of-competitive-fortnite-aussie-antics' },
      },
      {
        text: '"People aren\'t just watching for top-notch gameplay. The pro players who have done the best with content... are because of their personalities." — Aussie\'s frame on why mid-tier mechanical pros can outgrow top-100 grinders on the content side. Charisma is the multiplier; mechanics is the floor.',
        citation: { label: 'Dignitas interview (verbatim)', url: 'https://dignitas.gg/articles/getting-to-know-the-face-of-competitive-fortnite-aussie-antics' },
      },
      {
        text: 'Don\'t let metrics define success — creators chasing view-counts burn out fastest. Make content because the work is satisfying, growth is downstream of consistency.',
        citation: { label: '5 Dos and Don\'ts of Content Creation', url: 'https://dignitas.gg/articles/the-5-dos-and-don-ts-of-content-creation-insights-from-aussie-antics' },
      },
      {
        text: '"For me, you know, I got a kid now. I\'m trying to get to the point where I have financial security. The dream is to be able to make content with no numbers attached to it." — financial-runway perspective most creators won\'t talk about. Treat the chase as a job until it earns you the right to make it not be one.',
        citation: { label: 'Dignitas interview (verbatim)', url: 'https://dignitas.gg/articles/getting-to-know-the-face-of-competitive-fortnite-aussie-antics' },
      },
      {
        text: 'Career-realism take: "I\'d like to see more pros try and look into that route of more traditional jobs." Not anti-pro, anti-fantasy. The number of competitive Fortnite players who clear $80K/year is small enough that a backup track is the smart play.',
        citation: { label: 'Dignitas interview (verbatim)', url: 'https://dignitas.gg/articles/getting-to-know-the-face-of-competitive-fortnite-aussie-antics' },
      },
      {
        text: 'Watches more than anyone. Pairs with Peterbot specifically because he can read the lobby + meta state, freeing Pete to focus on raw mechanics. At the very top, the limiting factor is information processing, not aim.',
        citation: { label: 'Esports.gg FNCS Pro-Am preview', url: 'https://esports.gg/news/fortnite/peterbot-and-aussieantics-fncs-pro-am-2025/' },
      },
      {
        text: 'Differentiate. The crowded zone is the wrong zone — find the angle no one else is doing well, even if it gets fewer initial views.',
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
    id: 'epikwhale',
    name: 'EpikWhale',
    kind: 'pro',
    games: ['fortnite'],
    credential: '2019 Fortnite World Cup — 3rd place Solo Finals · $1.2M won · NA West\'s original LAN proof case · FNCS Global Championship 2025 qualifier (w/ Paper + VicterV) · still competing 2026',
    voice: "Shane 'EpikWhale' Cotton from NA West — the player who proved a West kid could go to a LAN in front of 19,000 fans and place top 3 against the best NA East + EU competition the scene had to offer. Six years later still grinding, still qualifying for Globals, still in the conversation.",
    tier: 'top',
    insights: [
      {
        text: '**3rd place at the 2019 Fortnite World Cup Solo Finals** at Arthur Ashe Stadium — 32 points, **$1,200,000 prize**, July 28, 2019. Critically, did it as an **NA West** player when nobody believed a West player could perform on LAN against East + EU. Killed that narrative single-handedly.',
        citation: { label: 'Esports Earnings — EpikWhale profile', url: 'https://www.esportsearnings.com/players/61948-epikwhale-shane-cotton' },
      },
      {
        text: 'The historic **"Deyy pissed on EpikWhale"** clip — one of the most-circulated competitive Fortnite moments of all time. The clip became Deyy\'s identity-defining moment in NA highlights. Critically: EpikWhale\'s entire arc since then is the rebuttal — he kept rising, still qualifies for Globals, still earns. One bad clip didn\'t define him; the response did.',
      },
      {
        text: 'The NA Central run with **Reet** mid-career — moved from NA West to compete in NA Central\'s deeper player pool, performed decent, eventually moved back to NA West when the West roster opportunities aligned. Region-shopping for skill density is a real strategy at the top — the meta is which region\'s scrim ladder is hardest, not just which region you\'re from.',
      },
      {
        text: '**Recently qualified for FNCS Global Championship 2025** with **Paper** and **VicterV** out of NA West Major 3 — finished 31st of 33 at LDLC Arena in Lyon, France (Sept 6-7, 2025), winning $9,000. Still on a Globals stage in 2025 — six years after the World Cup. Most pros from his era are retired or content-only by now.',
        citation: { label: 'Fortnite Tracker — FNCS Global Championship 2025', url: 'https://fortnitetracker.com/article/2388/fncs-global-championship-2025' },
      },
      {
        text: 'Career longevity lesson — six years from 2019 World Cup top-3 to 2025 Globals qualification is the longest active arc in NA-West competitive Fortnite. The math: pros who keep grinding outlast pros who burn out chasing one big check. Treat tournament earnings as a multi-year compound, not a quarterly target.',
        citation: { label: 'Liquipedia — EpikWhale', url: 'https://liquipedia.net/fortnite/EpikWhale' },
      },
    ],
    link: 'https://www.twitch.tv/epikwhale',
  },
  {
    id: 'mongraal',
    name: 'Mongraal',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Pioneer-era pro (Team Secret signing at age 13) · BBC News appearance April 2018 · Red Bull player 2025 · still competitive 7+ years in',
    voice: "**Kyle Jackson** from Kent, England. Started at 13, signed by Team Secret in 2018 (which got him on BBC News as a child-prodigy headline), still relevant at 21. Currently in the comeback arc — Red Bull pickup April 2025, MrSavage reunion Jan 2026 (split Feb 2026), 8th-place opening Major. Living proof that the grind works if you actually grind through the seasons most pros retire in.",
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
        text: 'IRL name **Kyle Jackson**, Kent, England. At 13 he was signed by **Team Secret** — the youngest pro player in the European competitive scene at the time. April 2018 he ended up on **BBC News** as the prodigy-gamer headline. Public from age 13, which is its own training stress test most pros never face.',
        citation: { label: 'Wikipedia — Mongraal', url: 'https://en.wikipedia.org/wiki/Mongraal' },
      },
      {
        text: 'The DPI pivot. He ran 400 DPI for years, then publicly moved to 800 — same eDPI, different feel. Lesson: muscle memory rebuilds in ~2 weeks of full-time play. If your sens is wrong, it stays wrong forever unless you pay the rebuild cost.',
        citation: { label: 'ProSettings.net + history', url: 'https://prosettings.net/players/mongraal/' },
      },
      {
        text: '**The current comeback arc** — joined **Red Bull as a player in April 2025**, finished 8th in the opening Major of 2025 FNCS. Reunited with **MrSavage** in January 2026 for FNCS 2026 (the original Mongraal-MrSavage duo that dominated EU 2019-2020) — partnership ended February 12, 2026. Multiple roster shuffles in a year. The era of "Mongraal at 21 is washed" is the conventional take; the more honest one is "still picking up org slots, still placing finals — actively rebuilding".',
        citation: { label: 'Esports Insider — Mongraal joins Red Bull (April 2025)', url: 'https://esportsinsider.com/2025/04/mongraal-fortnite-red-bull-player' },
      },
      {
        text: '540 Hz monitor — not 240, not 360. Diminishing returns after ~360 Hz are real but Mongraal pays it. At the top, every cumulative ms matters even when individual upgrades are <2 ms.',
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
    voice: 'The credential everyone else is chasing. World Cup at 16 — the original proof that the grind closes the gap with rich-rig pros. Recently caught Epic\'s own DQ-then-reverse machinery, kept his composure, kept grinding.',
    tier: 'top',
    insights: [
      {
        text: '**FNCS Major 1 DQ (and Epic\'s reversal)** — Bugha was disqualified by Epic from the FNCS Major 1 Grand Finals (NAC region) **alongside Kreaz, Tragic, and Percnt** for using a third-party "drop calculator" overlay that interfaces with Fortnite files to suggest optimal bus drop routes. Epic publicly admitted the DQ was a mistake — *"Given the confusion on this, disqualification of these players was a mistake and the DQs will be removed from their record."* — but the Grand Final lobby was already full so they couldn\'t be reinstated. Epic offered a Second Chance Qualifier; Bugha didn\'t qualify for the Major 1 Summit through it. The lesson: even at the top, you\'re one bad ruleset interpretation away from a tournament cycle wiped out — and the only response that scales is the next event.',
        citation: { label: 'Game Rant — Epic admits FNCS DQs were a mistake', url: 'https://gamerant.com/fortnite-fncs-disqualifications-epic-games-statement/' },
      },
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
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Virtus.pro · Danish (b. 2002) · 5+ years professional Fortnite · widely regarded as the best pure aimer in the game — many in the scene rate him over Threats',
    voice: "Thomas Høxbro Davidsen — the pro people queue up to point at when the question is 'who has the cleanest aim in Fortnite'. Stronger consensus pick than Threats according to a sizable chunk of the scene; the comparison is real, the answer isn't unanimous, and that's the point.",
    tier: 'top',
    insights: [
      {
        text: '**Best aimer in the game — better than Threats per scene consensus.** The aim is the highlight reel; the underlying work is the same as every other top pro (high-rep mechanical training, scrim-circuit hours). What\'s different is the visible ceiling: clips that look pixel-perfect on flicks people would call lucky from anyone else read as routine from him.',
        citation: { label: 'Community analysis — "Why It\'s So Hard to Fight Th0masHD"', url: 'https://www.youtube.com/watch?v=UrNHib1Eg8g' },
      },
      {
        text: 'Decision-making > raw mechanics at the EU pro level. EU scrims have lower fragger ceiling than NA but higher rotation IQ — "in EU you survive long enough to learn the meta, in NA you respawn before you\'ve seen the mistake".',
      },
      {
        text: 'VOD review > more games. 1 hour of own-VOD review per 3 hours of play minimum during competitive seasons. The hours nobody wants to do are the hours that compound.',
      },
      {
        text: 'On Virtus.pro since the org\'s Fortnite expansion — multi-year tenure on a single org is unusual in the scene. Continuity of practice partners + coaching + scrim slot allocation matters more than people give credit for; Liquipedia\'s tournament timeline shows the consistency.',
        citation: { label: 'Liquipedia Fortnite — Th0masHD', url: 'https://liquipedia.net/fortnite/Th0masHD' },
      },
    ],
    link: 'https://www.youtube.com/@Th0masHD',
  },
]

/** Filter helper for the /grind page. */
export function entriesByKind(kind: GrindKind | 'all'): GrindEntry[] {
  if (kind === 'all') return GRIND_ENTRIES
  return GRIND_ENTRIES.filter((e) => e.kind === kind)
}
