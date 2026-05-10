/**
 * Hardware advisory — per-category tier ladders. Pulled from the same
 * sources as /grind (ProSettings.net pro configs + Aussie Antics' PT
 * background). Every item is something at least one cited pro currently
 * runs OR is a documented budget alternative the scene endorses.
 *
 * Build to grow: add a new HardwareItem to a category, ship.
 */

export type HardwareCategory =
  | 'mouse'
  | 'keyboard'
  | 'monitor'
  | 'mousepad'
  | 'ergonomics'

export type HardwareTier = 'goat' | 'pro' | 'budget' | 'principle'

export interface HardwareItem {
  /** Display name. */
  name: string
  /** USD price band — "$" / "$$" / "$$$" or a literal range. */
  price: string
  /** Tier within its category. */
  tier: HardwareTier
  /** 1-2 sentence WHY — input lag, weight, build, etc. */
  why: string
  /** Optional cited pro who runs it (cross-references /grind). */
  citedPro?: string
  /** Optional source link (ProSettings.net page, manufacturer spec). */
  link?: string
  /** Optional gotcha — what to watch for when you actually buy. */
  caveat?: string
}

export interface HardwareSection {
  id: HardwareCategory
  /** Display label. */
  label: string
  /** Eyebrow context — what the category is FOR. */
  blurb: string
  items: HardwareItem[]
}

export const HARDWARE: HardwareSection[] = [
  {
    id: 'mouse',
    label: 'Mouse',
    blurb:
      "Lightest-possible body + flagship sensor. Sub-60g is the converged-mechanics standard. Polling 1000 Hz minimum (4K Hz on Razer). Every cited GOAT runs in the same band.",
    items: [
      {
        name: 'Logitech G PRO X Superlight 2',
        price: '$159',
        tier: 'goat',
        why:
          '60g, HERO 2 sensor (32K DPI, 888 IPS). Industry-default — Peterbot, Mongraal, Veno, Reet, half the active FNCS field. Wireless dongle is sub-1ms latency.',
        citedPro: 'Peterbot · Mongraal · Veno',
        link: 'https://www.logitechg.com/en-us/products/gaming-mice/pro-x-superlight-2.html',
        caveat: 'White colorway has a known coating wear after 6+ months of heavy use. Black holds up.',
      },
      {
        name: 'Razer Viper V2 Pro',
        price: '$149',
        tier: 'pro',
        why:
          '58g, Focus Pro 30K sensor. Lighter than the G PRO X S2 by 2g — meaningful at the top. Wireless. Razer ecosystem if you want the 4K Hz polling dongle add-on (extra $30).',
        link: 'https://www.razer.com/gaming-mice/razer-viper-v2-pro',
      },
      {
        name: 'Pulsar X2 V2 / Lamzu Atlantis Mini',
        price: '$70-90',
        tier: 'budget',
        why:
          "Boutique 50-55g shells with PixArt PAW3395 sensor. Same flagship sensor as $150 mice — you're paying $80 less for less name recognition + sometimes worse QC, not less performance.",
        caveat: 'QC variance is real on boutique brands — check the return-window policy.',
      },
    ],
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    blurb:
      "Hall-effect / magnetic switches are the new pro standard. Adjustable actuation point + rapid-trigger reset = ~5 ms faster taps than mechanical. The Wooting tier is the divider between 'pro' and 'best mechanical'.",
    items: [
      {
        name: 'Wooting 60HE+ / Wooting 80HE',
        price: '$200-260',
        tier: 'goat',
        why:
          'Magnetic Lekker switches. Per-key adjustable actuation (0.1-4.0 mm), rapid-trigger reset, snap-tap (instant counter-strafing). Veno cited it as the new pro standard. Open-source firmware (Wooting QMK).',
        citedPro: 'Veno',
        link: 'https://wooting.io/wooting-60he',
        caveat: '60HE+ is sometimes hard to source US-side — wooting.io ships from EU. 80HE has wider US retail.',
      },
      {
        name: 'SteelSeries Apex Pro TKL Gen 3',
        price: '$200',
        tier: 'pro',
        why:
          'OmniPoint 2.0 magnetic switches. Same per-key adjustable actuation idea as Wooting, easier to find at US Best Buy / Amazon. Peterbot runs the Apex PRO TKL.',
        citedPro: 'Peterbot',
        link: 'https://steelseries.com/gaming-keyboards/apex-pro-tkl-gen-3',
      },
      {
        name: 'Akko 5075B / Keychron V1 / Ducky One 3',
        price: '$80-130',
        tier: 'budget',
        why:
          'Solid mechanical keyboards (Cherry MX / Gateron / hot-swap). No hall-effect — you give up adjustable actuation + rapid-trigger. If your aim ceiling is mechanical-detected (sub-100 hr/wk grinder), fine. If you scrim daily, save for a hall-effect.',
      },
    ],
  },
  {
    id: 'monitor',
    label: 'Monitor',
    blurb:
      "Refresh rate matters more than resolution for FPS. 1080p @ 240+ Hz is the converged pro choice. The other lever pros now obsess over: **DyAC+** (BenQ ZOWIE's panel-side motion-blur reduction). It strobes the backlight in sync with the refresh — eliminates trail-blur on tracking moves at the panel level, not via driver. Once you've tracked an enemy with DyAC+ on, going back to a regular IPS feels like dragging a smear.",
    items: [
      {
        name: 'BenQ ZOWIE XL2566K — 360 Hz + DyAC+',
        price: '$550',
        tier: 'goat',
        why:
          'The pro standard. 360 Hz TN panel with DyAC+ motion-blur reduction. **What Peterbot runs.** TN sounds dated but at 360 Hz + DyAC+ the response time + motion clarity beats every IPS at this price. Small panel (24.5") on purpose — pro-eye-distance.',
        citedPro: 'Peterbot',
        link: 'https://zowie.benq.com/en-us/monitor/xl2566k.html',
      },
      {
        name: 'BenQ ZOWIE XL2546K — 240 Hz + DyAC+',
        price: '$400',
        tier: 'pro',
        why:
          "Same DyAC+ tech, one refresh tier down. 240 Hz still saturates competitive Fortnite (frame cap 240). If you can't justify the 360 Hz tier, this is the best price/perf with the motion-clarity tech intact.",
        link: 'https://zowie.benq.com/en-us/monitor/xl2546k.html',
      },
      {
        name: 'Alienware AW2524HF (500 Hz IPS, no DyAC)',
        price: '$650',
        tier: 'pro',
        why:
          "500 Hz IPS at 1080p. Higher refresh than the ZOWIE 360 but no DyAC+ — IPS panel response can't match strobed TN for tracking clarity. Pick this if you value color over motion (you stream + do creative work) or if Mongraal-tier 540 Hz aspirations matter to you.",
      },
      {
        name: 'Gigabyte G24F2 / AOC 24G15N (180 Hz IPS)',
        price: '$160-200',
        tier: 'budget',
        why:
          "165-180 Hz IPS at 1080p. No DyAC, IPS so blur trails on tracking — but: the jump from a stock 60 Hz laptop screen to a 180 Hz IPS is the single biggest 'feel' upgrade you can buy under $200. Get this first, save for a ZOWIE later.",
      },
      {
        name: 'HDR — turn it OFF',
        price: '—',
        tier: 'principle',
        why:
          "HDR adds composition latency to the Windows display pipeline. Every cited pro config has it disabled. Doesn't matter how good your monitor is — HDR-on costs ~5 ms.",
      },
      {
        name: 'DyAC+ at full brightness — turn brightness DOWN',
        price: '—',
        tier: 'principle',
        why:
          "DyAC+ strobing dims the panel by ~30%. Most ZOWIE owners crank brightness to compensate, then complain motion looks 'flickery'. Lower brightness in a darker room = same perceived brightness with the strobe artifacts gone.",
      },
    ],
  },
  {
    id: 'mousepad',
    label: 'Mousepad',
    blurb:
      "Large pad (35×40+ cm) for low-eDPI players. Soft cloth, NOT hard plastic — Fortnite's flick-and-control demand a predictable stop. Pad surface affects feel more than mouse weight does past a certain point.",
    items: [
      {
        name: 'GameSense Radar (Benjyfishy)',
        price: '$60',
        tier: 'goat',
        why:
          '**What Peterbot runs.** Mid-speed cloth, dense weave, large size. Designed by/for Benjyfishy and other top FNCS competitors. The pro-pad-of-record across the current FNCS field.',
        citedPro: 'Peterbot',
        link: 'https://gamesense.gg/products/radar',
      },
      {
        name: 'Artisan Hien (Mid)',
        price: '$50-65',
        tier: 'goat',
        why:
          "**What Diggy runs for Fortnite.** Japanese boutique. Mid-speed, balanced control + glide. Pick Hien Mid for Fortnite's flick-then-track motion; Soft is too slow, Xsoft is too floaty. Cult-favorite for low-sens players for a decade running.",
        caveat: 'Real Artisan ships from Japan (Amazon listings are mostly counterfeit). Order from artisan-jp.com or a verified reseller.',
        link: 'https://artisan-jp.com/eng_hien.html',
      },
      {
        name: 'Wallhack Cloth',
        price: '$35-45',
        tier: 'pro',
        why:
          "**What Diggy currently uses.** Mid-speed cloth, locally available, holds up. Good price/perf if you don't want to wait on an Artisan import.",
      },
    ],
  },
  {
    id: 'ergonomics',
    label: 'Ergonomics',
    blurb:
      "Aussie Antics: 10-hour sessions = tendinitis risk one bad week away. The body grind is real — hardware that lets you grind longer compounds with hardware that lets you grind faster.",
    items: [
      {
        name: 'Soft fabric wrist rest (NOT gel)',
        price: '$10-25',
        tier: 'principle',
        why:
          "Gel rests compress wrist circulation under sustained pressure — long-term carpal tunnel risk. Soft cloth (Corsair MM100, Glorious wrist rest) supports without compressing.",
        citedPro: 'Aussie Antics',
      },
      {
        name: 'Monitor at arm\'s length, top bezel at eye level',
        price: '—',
        tier: 'principle',
        why:
          "Pulling chairs in close = neck strain over a 6-hour scrim. Top of monitor at eye level keeps your gaze slightly down (natural relaxed posture). Stack books under the monitor stand if it's too low.",
      },
      {
        name: '90-minute stretch alarm',
        price: '$0',
        tier: 'principle',
        why:
          "Set a phone timer. Every 90 min: stand up, wrist + forearm rotations, neck rolls, 60-second walk. Aussie's PT-background advice — don't trust how it 'feels', the damage is silent.",
        citedPro: 'Aussie Antics',
      },
      {
        name: 'Chair: arms at 90°, feet flat',
        price: '$200-1000',
        tier: 'principle',
        why:
          "You don't need a Herman Miller. You need: armrest height that lets your elbow hold 90° without shrugging shoulders, seat height that lets your feet rest flat (no dangling), lumbar support that doesn't force a hunch. Adjustable beats expensive.",
      },
    ],
  },
]
