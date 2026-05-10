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
        text: '**"Fuck off the region nigga, this is my region boy!"** Said during the **2026 Esports World Cup playing on EU with Curve** (2026-05-08). Cross-region history made literal — Veno (the NA-based, EU-origin pro who already won FNCS Grand Finals in both regions) defending his territorial claim on the same EU scrim ladder where he started his career. The Veno-as-region-bridge story isn\'t about diplomatic optics; it\'s about owning whichever region his team is in this season.',
        citation: { label: 'Veno EWC stream — verbatim (2026-05-08)' },
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
    credential: 'Multi-FNCS finalist · public-facing pro Twitch stream',
    voice: 'Trains in public — daily routine + settings are documented (ProSettings + community breakdowns) rather than rumored.',
    tier: 'top',
    rig: {
      dpi: 'see ProSettings',
      monitor: '240 Hz',
      mouse: 'Razer Viper Ultimate',
      keyboard: 'Logitech G PRO',
    },
    insights: [
      {
        text: 'In-game settings: **Brightness 117**, Performance render mode, V-Sync OFF, 240 FPS cap. All tuned for outline visibility + frame consistency rather than aesthetics.',
        citation: { label: 'ProSettings.net — Clix', url: 'https://prosettings.net/players/clix/' },
      },
      {
        text: 'Daily training cited at duelmasters.io: edit courses + retakes + scenario-focused 1v1s, not pure aim-trainer hours. Mechanics + decision-making are trained as separate reps.',
        citation: { label: 'duelmasters.io — Clix breakdown', url: 'https://www.duelmasters.io/blog/clix-fortnite-settings' },
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
    credential: 'Top controller pro · multi-FNCS finalist · public config at specs.gg',
    voice: 'High-finish-rate controller pro. Settings + bind layout are documented at specs.gg rather than reverse-engineered from clips.',
    tier: 'top',
    rig: {
      dpi: 'controller',
      monitor: 'high refresh',
      mouse: 'controller (preferred binds: V stairs, B cone, M4/M5 wall per specs.gg)',
    },
    insights: [
      {
        text: 'Bind layout is documented at specs.gg — V stairs, B cone, M4/M5 wall. Customizing controller binds to your thumb travel matters more than KBM does because there are fewer keys; each one has to be perfectly placed.',
        citation: { label: 'specs.gg — Reet config', url: 'https://specs.gg/Reet' },
      },
    ],
    link: 'https://www.twitch.tv/reet',
  },
  {
    id: 'bugha',
    name: 'Bugha',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Solo Fortnite World Cup champion 2019 · $3M prize · still competing professionally',
    voice: 'Won Solo World Cup at 16. Career has spanned every major Chapter since — one of the few from the 2019 era still on the FNCS circuit.',
    tier: 'top',
    insights: [
      {
        text: '**Solo World Cup champion 2019** — beat 100 of the world\'s top qualifiers in NYC at age 16, took home $3M (largest prize ever for a single esports tournament at the time). The credential the rest of the scene is still measured against.',
        citation: { label: 'Wikipedia — Bugha (2019 Fortnite World Cup)', url: 'https://en.wikipedia.org/wiki/Bugha' },
      },
      {
        text: '**FNCS Major 1 DQ + Epic\'s reversal** — Bugha was disqualified from the FNCS Major 1 Grand Finals (NAC) alongside Kreaz, Tragic, and Percnt for using a third-party "drop calculator" overlay. Epic publicly admitted the DQ was a mistake — *"Given the confusion on this, disqualification of these players was a mistake and the DQs will be removed from their record."* — but the Grand Final lobby was already full so they couldn\'t be reinstated. Epic offered a Second Chance Qualifier; Bugha didn\'t qualify for Major 1 Summit through it.',
        citation: { label: 'Game Rant — Epic admits FNCS DQs were a mistake', url: 'https://gamerant.com/fortnite-fncs-disqualifications-epic-games-statement/' },
      },
    ],
    link: 'https://www.twitch.tv/bugha',
  },

  {
    id: 'khanada',
    name: 'Khanada',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Multi-FNCS finalist · long-tenured top-tier across multiple chapters',
    voice: 'Long-tenured NA pro — competitive across multiple chapter resets, which itself is the rarer credential. Most pros peak in one meta and fade; staying relevant through three is the harder thing.',
    tier: 'standard',
    rig: {
      monitor: '240 Hz',
    },
    insights: [
      {
        text: 'Heavy creative-mode hours, scrim-light. Inverse of Clix — proves the work can come from either lane. Match your training distribution to your specific mechanical gap, not to the most-streamed pro.',
      },
      {
        text: 'Career longevity > peak skill. Staying competitive across multiple chapter overhauls (each of which resets meta + mechanics) means re-learning movement, edits, and economy from scratch. Most "fell off" stories are just one meta away from "couldn\'t adapt".',
        citation: { label: 'Khanada FNCS history', url: 'https://liquipedia.net/fortnite/Khanada' },
      },
    ],
    link: 'https://www.twitch.tv/khanada',
  },
  {
    id: 'th0masHD',
    name: 'Th0masHD',
    kind: 'pro',
    games: ['fortnite'],
    credential: 'Virtus.pro · Danish (b. 2002) · long-tenured EU pro with documented competitive history',
    voice: "Thomas Høxbro Davidsen — Danish EU pro on Virtus.pro. Career history + tournament placements are documented on Liquipedia rather than reverse-engineered from highlight clips.",
    tier: 'top',
    insights: [
      {
        text: 'On Virtus.pro for multi-year tenure — unusually long single-org stint in the Fortnite scene. Continuity of practice partners + coaching + scrim slot allocation tends to matter more than people give credit for; Liquipedia\'s tournament timeline shows the consistency.',
        citation: { label: 'Liquipedia Fortnite — Th0masHD', url: 'https://liquipedia.net/fortnite/Th0masHD' },
      },
      {
        text: 'EU pro with consistent FNCS placements across multiple chapters — a track record that\'s harder to put together than a single peak season because each chapter resets meta + mechanics. Full event history at the cited link.',
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
