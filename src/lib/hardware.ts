/**
 * Hardware advisory — per-category component candidates with source links.
 * Public player configurations are personal snapshots, not performance
 * proof or a universal buying list.
 *
 * Build to grow: add a new HardwareItem to a category, ship.
 */

export type HardwareCategory =
  | 'cpu'
  | 'gpu'
  | 'ram'
  | 'motherboard'
  | 'storage'
  | 'psu'
  | 'cooling'
  | 'case'
  | 'networking'
  | 'mouse'
  | 'skates'
  | 'keyboard'
  | 'monitor'
  | 'mousepad'
  | 'headset'
  | 'ergonomics'

export type HardwareTier = 'goat' | 'pro' | 'budget' | 'principle'

/** Copy review date; prices, stock, and player usage are not live data. */
export const HARDWARE_COPY_REVIEWED = '2026-09-20'

export interface HardwareItem {
  /** Display name. */
  name: string
  /** USD price band — "$" / "$$" / "$$$" or a literal range. */
  price: string
  /** Optional manufacturer price link; listed prices are point-in-time snapshots. */
  priceUrl?: string
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
    id: 'cpu',
    label: 'CPU',
    blurb:
      "Fortnite is often CPU-limited at high refresh, but the correct upgrade depends on your measured CPU/GPU bound time and 1% lows. X3D parts are a strong competitive reference; dual-CCD pinning is a fallback to test, not a universal requirement.",
    items: [
      {
        name: 'AMD Ryzen 7 9850X3D',
        price: '$499',
        tier: 'goat',
        why:
          'High-end X3D candidate for CPU-bound, high-refresh play. Compare current Fortnite benchmarks against the 9800X3D at your resolution and settings; no published result guarantees the same gap on your rig.',
        link: 'https://www.tomshardware.com/pc-components/cpus/amd-ryzen-7-9850x3d-vs-ryzen-7-9800x3d',
      },
      {
        name: 'AMD Ryzen 7 9800X3D',
        price: '$479',
        tier: 'pro',
        why:
          'High-end X3D alternative. Check current Fortnite results, platform cost, and your own CPU-bound frametimes before paying extra for a newer model; the ranking can change with game patch and settings.',
        link: 'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9800x3d.html',
      },
      {
        name: 'AMD Ryzen 7 7800X3D',
        price: '$359',
        tier: 'pro',
        why:
          'A previous-generation 8-core, 96MB 3D V-Cache reference that can be excellent value when discounted. Fortnite results vary with patch, GPU, memory training, and frame cap; confirm the board BIOS and CPU-support list instead of assuming any AM5 board is equivalent.',
        link: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800x3d.html',
      },
      {
        name: 'Intel Core i9 14900K',
        price: '$499',
        tier: 'pro',
        why:
          '8 P-core + 16 E-core hybrid. It can remain competitive, but 13th/14th-gen stability and microcode status deserve a check before tuning. Use current BIOS guidance and Intel Default Settings, then measure your own 1% lows; do not assume a fixed gap to an X3D part. Pinning is a fallback to test, not a repair.',
        link: 'https://www.intel.com/content/www/us/en/products/sku/236773/intel-core-i9-processor-14900k-36m-cache-up-to-6-00-ghz/specifications.html',
        caveat:
          'On affected 13th/14th-gen desktop CPUs, check /diagnostics. Intel guidance is current BIOS/microcode 0x12F or later plus Intel Default Settings; WHEA is a signal to investigate, not proof of degradation.',
      },
      {
        name: 'AMD Ryzen 5 7600X / 9600X',
        price: '$199 / $249',
        tier: 'budget',
        why:
          'A sensible budget starting point for a CPU-bound build, but FPS depends on the scene, GPU, memory, and cap. Pair with a compatible B650/DDR5 platform and verify upgrade support with the board vendor instead of assuming every future CPU is a drop-in.',
      },
    ],
  },
  {
    id: 'gpu',
    label: 'GPU',
    blurb:
      "At competitive settings, Fortnite may be CPU- or GPU-limited depending on scene, resolution, render mode, and frame cap. No GPU vendor wins every patch; compare current Fortnite benchmarks and your measured bottleneck before upgrading.",
    items: [
      {
        name: 'NVIDIA GeForce RTX 5090',
        price: '$1999',
        tier: 'goat',
        why:
          'Blackwell flagship, 32GB GDDR7, and 575W TBP. It is usually a poor value for 1080p competitive play unless you also need high-end 4K, creator, or AI workloads. Confirm case, PSU, connector, and thermals before buying.',
        link: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/',
      },
      {
        name: 'NVIDIA GeForce RTX 5080',
        price: '$999',
        tier: 'goat',
        why:
          'A high-end reference with 16GB GDDR7 and 360W board power. It is not required for competitive Fortnite; verify your real GPU utilization and frame-time bound before spending at this tier. Feature support varies by game and driver.',
        link: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5080/',
      },
      {
        name: 'NVIDIA GeForce RTX 5070 Ti',
        price: '$749',
        tier: 'pro',
        why:
          '16GB GDDR7 and 300W board power. A strong upper-midrange reference, but compare current independent benchmarks and your actual GPU utilization instead of carrying a fixed percentage across games.',
        link: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/',
      },
      {
        name: 'NVIDIA GeForce RTX 5060 Ti 16GB',
        price: '$449',
        tier: 'budget',
        why:
          'A sensible starting point where 16GB VRAM and current driver support matter. Do not promise a fixed FPS target: measure your scene, resolution, and CPU pairing before buying.',
      },
    ],
  },
  {
    id: 'ram',
    label: 'RAM',
    blurb:
      "DDR5-6000 CL30 is a common AM5 starting point, not a guarantee of the best memory-controller result. Validate UCLK/MEMCLK behavior on the actual CPU and board; two matched sticks are usually easier to train than four. Retail memory pricing moves, so the bands below are approximate and not live market data.",
    items: [
      {
        name: 'G.Skill Trident Z5 Royal Neo 32GB DDR5-6000 CL28',
        price: '$390-$420',
        tier: 'goat',
        why:
          'A low-latency reference kit. IC labeling, memory-controller margin, and board training vary by batch and platform; use only the manufacturer-rated profile if you choose to enable one, and validate stability before tournament use. This app does not prescribe timings or voltage.',
        link: 'https://www.gskill.com/product/165/390/1726195627/F5-6000J2836G16GX2-TR5RKE',
      },
      {
        name: 'Corsair Vengeance 32GB DDR5-6000 CL30',
        price: '$340-$370',
        tier: 'pro',
        why:
          'A common DDR5-6000 CL30 reference with platform profile support. Confirm the exact kit part number, board QVL, and CPU memory-controller behavior; do not infer a stable manual timing or voltage from the retail label.',
      },
      {
        name: 'Kingston Fury Beast 32GB DDR5-6000 CL36',
        price: '$270-$300',
        tier: 'budget',
        why:
          'A sensible capacity-and-price baseline. Rated profiles are optional and board/CPU training is not guaranteed across every system; leave timings and voltage at vendor defaults unless you are doing a separate, reversible stability experiment.',
      },
    ],
  },
  {
    id: 'motherboard',
    label: 'Motherboard',
    blurb:
      "X870E (AM5) or Z890 (Intel) for the headroom and PCIe Gen5. Tournament rigs go mid-tier X870 / B650E — the flagship features (Wi-Fi 7, 10GbE, exotic OLED screens) don't move FPS.",
    items: [
      {
        name: 'ASUS ROG Strix X870E-E Gaming WiFi',
        price: '$499',
        tier: 'goat',
        why:
          'AM5, X870E chipset, and PCIe Gen5 connectivity with substantial board-level headroom. Compare the exact BIOS support list, firmware maturity, I/O, and vendor software footprint; gaming performance is not created by an overclock preset. AI Suite is optional software and can be disabled through the app only if the catalog detects its autostart entry.',
      },
      {
        name: 'MSI MAG B650 Tomahawk WiFi',
        price: '$229',
        tier: 'pro',
        why:
          'A reasonable AM5 gaming platform when its current BIOS supports the chosen CPU. Compare VRM thermals, memory QVL, firmware history, I/O, and price; chipset branding alone does not determine Fortnite frame time.',
      },
      {
        name: 'ASRock B650M PG Lightning',
        price: '$139',
        tier: 'budget',
        why:
          'mATX, still handles X3D + DDR5-6000 CL30 cleanly. Fewer fan headers + no flagship audio chip, but the gameplay-side feature set is identical.',
      },
    ],
  },
  {
    id: 'storage',
    label: 'Storage',
    blurb:
      "PCIe Gen4 NVMe is the practical default for a game drive. Gen5 benefits depend on workload and DirectStorage adoption; game load time is not determined by sequential spec alone. Put Fortnite on a healthy SSD with free space and current firmware. Prices below are approximate, not live market data.",
    items: [
      {
        name: 'Samsung 990 Pro 2TB NVMe',
        price: '$370-$430',
        tier: 'goat',
        why:
          'A strong PCIe Gen4 reference with vendor-advertised sequential and random figures. Keep firmware current, leave thermal headroom, and do not expect benchmark numbers to become proportional Fortnite input-latency gains.',
        link: 'https://www.samsung.com/us/computing/memory-storage/solid-state-drives/990-pro-pcie-4-0-nvme-ssd-2tb-mz-v9p2t0b-am/',
        caveat:
          'Samsung Magician = the autostart trap. Install once to flash firmware, then uninstall the service. Sits at 30 MB resident for nothing.',
      },
      {
        name: 'WD Black SN850X 2TB',
        price: '$280-$350',
        tier: 'pro',
        why:
          '7300 MB/s, identical real-world perf to 990 Pro. WD\'s software is less aggressive — install Dashboard once for firmware, never sees it again.',
      },
      {
        name: 'Crucial T705 / Samsung 9100 Pro (Gen5)',
        price: '$400+',
        tier: 'principle',
        why:
          'PCIe Gen5 12-14 GB/s. It is not an automatic Fortnite input-latency upgrade; game launch/load behavior depends on the game, storage state, CPU, and workload. Buy for measured workload needs or productivity, not sequential numbers alone.',
      },
    ],
  },
  {
    id: 'cooling',
    label: 'Cooling',
    blurb:
      "Use cooling to prevent thermal throttling and preserve stable vendor-default clocks. Cooler size, noise, socket support, case airflow, and sustained test results matter more than a blanket AIO recommendation; this app does not apply undervolts or thermal-limit changes.",
    items: [
      {
        name: 'Arctic Liquid Freezer III 360 ARGB',
        price: '$119',
        tier: 'goat',
        why:
          'A strong 360mm cooling reference for high-power desktop CPUs. Check independent noise/thermal tests, socket support, radiator clearance, pump warranty, and whether your case actually benefits before treating it as an upgrade.',
      },
      {
        name: 'Thermalright Peerless Assassin 120 SE',
        price: '$39',
        tier: 'pro',
        why:
          'A strong twin-tower air-cooling reference for stock-configured gaming CPUs. Check socket support, RAM clearance, case height, noise, and independent sustained-load tests instead of assuming one cooler fits every build.',
      },
      {
        name: 'Noctua NH-D15S G2',
        price: '$169',
        tier: 'pro',
        why:
          'A premium air-cooling reference with no pump to maintain. Compare sustained temperature/noise results on the actual CPU and case; no cooler can guarantee a fixed input-latency change.',
      },
    ],
  },
  {
    id: 'psu',
    label: 'PSU',
    blurb:
      "850W 80+ Platinum minimum for any RTX 50-series build. 5090 needs 1000W. Don't cheap out — a failing PSU corrupts SSDs and kills GPUs silently. Buy once.",
    items: [
      {
        name: 'Corsair RM1000x SHIFT',
        price: '$219',
        tier: 'goat',
        why:
          'Modular, side-mounted connectors (cable management win), 10-year warranty. 1000W handles RTX 5090 + 9800X3D + 4 NVMes + every fan you can fit. Silent under gaming load.',
      },
      {
        name: 'Seasonic FOCUS GX-850 ATX 3.1',
        price: '$139',
        tier: 'pro',
        why:
          'ATX 3.1 spec (handles GPU power spikes properly). 850W is enough for 5080-class builds. Seasonic OEMs half the premium-brand PSUs on the market.',
      },
      {
        name: 'be quiet! Pure Power 12 M 850W',
        price: '$119',
        tier: 'budget',
        why:
          'ATX 3.0, modular, quiet. 850W gets you 5070 Ti class. Don\'t go cheaper than this category — sub-$100 PSUs are the budget trap that ends builds.',
      },
    ],
  },
  {
    id: 'case',
    label: 'Case',
    blurb:
      "Airflow > aesthetics. Mesh-front (Lancool 216, Fractal North, NZXT H7 Flow) beats any glass-front box in CPU/GPU temps. The case is a 5-year part — spend more once.",
    items: [
      {
        name: 'Lian Li Lancool 216',
        price: '$109',
        tier: 'goat',
        why:
          'Mesh front, two 160mm front fans included, top-tier airflow at the price. Holds 360mm front AIO + 280mm top. The pro-build chassis floor.',
      },
      {
        name: 'Fractal Design North',
        price: '$139',
        tier: 'pro',
        why:
          'Wood-front mesh aesthetic, premium build, walnut or charcoal. Slightly worse pure-airflow vs Lancool 216 but the difference is sub-3°C and the room agrees.',
      },
      {
        name: 'Lian Li O11 Dynamic Evo',
        price: '$169',
        tier: 'pro',
        why:
          'Dual-chamber, the streaming-aesthetic case of the last 3 years. Glass front HURTS airflow vs mesh — compensate with 9 fans and you\'re fine, but you didn\'t buy it for thermals.',
      },
    ],
  },
  {
    id: 'networking',
    label: 'Networking',
    blurb:
      "ISP gateways can add variable queueing and jitter, but the size depends on the access network, firmware, and traffic load. A bypass or separate router is an advanced network project, not a guaranteed latency upgrade; measure bufferbloat and route stability first.",
    items: [
      {
        name: 'AT&T XGS-PON bypass via WAS-110 SFP+',
        price: '$60-100',
        tier: 'goat',
        why:
          'Can replace the BGW320 on compatible AT&T XGS-PON deployments, but firmware, authentication, optical levels, and support vary. It may simplify routing or expose better telemetry; it does not promise a fixed millisecond or bandwidth gain. Follow the current 8311 guide and keep a recovery path.',
        link: 'https://pon.wiki/xgs-pon/ont/bfw-solutions/was-110/',
        caveat:
          'Stock Azores firmware works for traffic but doesn\'t expose the 8311 metrics endpoint we read. Flash via pon.wiki\'s guide for the in-app temp card.',
      },
      {
        name: 'Ubiquiti UDM SE / Pro Max',
        price: '$499-599',
        tier: 'goat',
        why:
          '2.5GbE+SFP+ WAN, runs the whole UniFi stack. Smart Queues (CAKE) caps your upload at 95% to eliminate bufferbloat — A+ on dslreports / waveform with one toggle. The router most pro home-rigs land on.',
        link: 'https://store.ui.com/us/en/category/all-cloud-gateways/products/udm-pro-max',
      },
      {
        name: 'OPNsense on Intel N100 mini PC',
        price: '$199',
        tier: 'pro',
        why:
          'The power-user pick. Full BGP, per-VLAN QoS, DSCP marking, multi-WAN failover. ~10W idle. Steep config curve but every knob exists. Pair with the WAS-110 directly via the N100\'s SFP+ port.',
      },
      {
        name: 'Cat6a or Cat7 patch cable',
        price: '$10',
        tier: 'principle',
        why:
          'Wired from router → gaming PC. Cat6 is enough for 1Gbps, Cat6a for 10Gbps. Don\'t buy Cat8 — it\'s a marketing tier for >10G office runs, no benefit at home. Replace any cable older than 5 years; jacket cracking = pair separation = retrains.',
      },
    ],
  },
  {
    id: 'headset',
    label: 'Headset',
    blurb:
      'Wired is predictable, but modern gaming wireless can also be suitable. Codec, receiver mode, firmware, and the game audio path decide the real delay; there is no universal millisecond penalty. Footstep imaging and comfort matter more than a marketing label.',
    items: [
      {
        name: 'HyperX Cloud Alpha S',
        price: '$129',
        tier: 'goat',
        why:
          'Wired open-back headset option. Check fit, microphone needs, connection type, and whether you prefer open-back sound; a headset does not reduce game input latency.',
      },
      {
        name: 'HyperX Cloud III',
        price: '$99',
        tier: 'pro',
        why:
          'Newer iteration. Bigger drivers, USB-C + 3.5mm both standard. Slightly more colored sound vs Alpha S — try both at retail before committing.',
      },
      {
        name: 'Sennheiser HD 560S + Antlion ModMic',
        price: '$199 ($179 + $99)',
        tier: 'pro',
        why:
          'The audiophile-pro path. Open-back, ruler-flat response, best imaging in the price tier. ModMic Wireless attaches the mic separately. Drains your wallet but never the source of your aim problems.',
      },
    ],
  },
  {
    id: 'mouse',
    label: 'Mouse',
    blurb:
      'Choose a shape and sensor you can control, then validate polling stability on the actual rig. 1000 Hz is a sensible baseline; 4K/8K can reduce report interval but may add CPU or frametime cost, so it is not an automatic competitive upgrade.',
    items: [
      {
        name: 'Logitech G PRO X2 SUPERSTRIKE',
        price: '$179.99 (checked Sep 20, 2026)',
        priceUrl: 'https://www.logitechg.com/en-us/shop/p/pro-x2-superstrike-mouse.910-007700',
        tier: 'goat',
        why:
          'Listed on Peterbot\'s ProSettings profile updated Aug 31, 2026. That is one player\'s current preference, not evidence of lower latency or a universal best mouse. Check current availability and compatibility before buying.',
        citedPro: 'Peterbot',
        link: 'https://prosettings.net/players/peterbot/',
        caveat: 'Player gear and regional availability can change; compare shape, click feel, and polling stability on your own PC.',
      },
      {
        name: 'Razer Viper V4 Pro',
        price: '$159',
        tier: 'pro',
        why:
          "49g, Focus Pro 45K sensor, native 8000 Hz HyperSpeed Gen-2 (no separate dongle needed). Razer's current flagship, launched March 2026 — lighter than the V3 Pro and the G PRO X S2. The Razer pick if you want the newest sensor + native 8K.",
        link: 'https://www.razer.com/gaming-mice/razer-viper-v4-pro',
      },
      {
        name: 'Razer Viper V3 Pro',
        price: '$129',
        tier: 'budget',
        why:
          '54g, Focus Pro 35K sensor, native 8K Hz polling with the HyperPolling dongle. Razer\'s last-gen flagship — now discounted and still a top-tier competitive mouse. Buy this over the V4 Pro if you find it cheap and don\'t need the newest sensor.',
        link: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      },
      {
        name: 'Finalmouse UltralightX Prophecy',
        price: '$199',
        tier: 'pro',
        why:
          "**33g**, 8000 Hz, proprietary sensor, 3 sizes (classic / medium / small). The lightest serious competitive mouse you can buy. Configures entirely in your browser at **xpanel.finalmouse.com** — no driver install, no daemon to kill, settings save to the mouse. Same idea as Wooting's wootility-web for keyboards. Pick this if Synapse / G HUB / pulsarfusion eating background memory annoys you.",
        link: 'https://finalmouse.com/products/ulx-pro-series-overview',
        caveat: 'Finalmouse drops are notoriously limited — check stock before falling in love. Resale prices on out-of-stock SKUs get silly.',
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
    id: 'skates',
    label: 'Mouse skates',
    blurb:
      "Stock skates wear in 3-9 months. Aftermarket = faster glide, controlled stop, no peeling-corner risk. Boardzy's 200+ mouse + accessory tierlist on YouTube is the best current consensus source. r/MouseReview backs the same picks.",
    items: [
      {
        name: 'Tiger Arc / Arc 2',
        price: '$10-15',
        tier: 'goat',
        why:
          "Most-recommended default pick across r/MouseReview + Boardzy tierlists. Controlled glide, durable, won't peel at corners on aggressive flicks. The safe answer for any mouse you'd put them on.",
        link: 'https://esptiger.com/collections/tiger-arc-2-mouse-skates',
      },
      {
        name: 'Corepad Skatez Air',
        price: '$8-12',
        tier: 'pro',
        why:
          "100% PTFE, fastest glide tier. Has effectively replaced Hyperglide as the default fast-skate brand because Corepad ships day-one cuts for new mouse releases (Hyperglide is slow to release + stocks out constantly).",
        link: 'https://corepad.com/',
      },
      {
        name: 'Hyperglide',
        price: '$10-15',
        tier: 'pro',
        why:
          "The original PTFE-skate brand and still the speed reference where in-stock. Ships slowly and stocks out for popular mice — if you can't find them for your mouse, Corepad is the same tier.",
        link: 'https://hyperglide.com/',
      },
      {
        name: 'Hotline Games / X-Raypad Obsidian',
        price: '$5-10',
        tier: 'budget',
        why:
          "Hotline ships pre-cut skates for less-common mouse models nobody else stocks. X-Raypad Obsidian pairs natively with their pads (Equate / Aqua Control). Both are honest budget picks; expect 4-6 months of life vs Tiger's 6-9.",
      },
      {
        name: 'Application: clean with 90%+ isopropyl, press 10s, wait 10min before use',
        price: '—',
        tier: 'principle',
        why:
          "The most common reason skates 'fail' isn't the skate — it's adhesive that didn't fully set. Clean the underside, press firmly with a finger for 10 seconds per skate, then leave the mouse off the pad for 10 minutes. Skip this step and your first quick swipe lifts a corner.",
      },
    ],
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    blurb:
      'Hall-effect / magnetic switches expose adjustable actuation and rapid-trigger behavior. They can change key feel and release timing, but the useful result depends on the game, firmware, settings, and your control; no fixed millisecond gain is guaranteed.',
    items: [
      {
        name: 'Wooting 60HE+ / Wooting 80HE',
        price: '$200-260',
        tier: 'goat',
        why:
          'Magnetic switches with adjustable actuation and rapid-trigger features. These change key behavior, not guaranteed Fortnite input latency; follow current game rules for SOCD/snap-tap features and configure only permitted options.',
        link: 'https://wooting.io/wooting-60he',
        caveat: '60HE+ is sometimes hard to source US-side — wooting.io ships from EU. 80HE has wider US retail.',
      },
      {
        name: 'SteelSeries Apex Pro TKL Gen 3',
        price: '$200',
        tier: 'pro',
        why:
          'Magnetic switches with adjustable actuation. Peterbot\'s linked public profile lists the Apex Pro TKL Gen3; that is a gear snapshot, not a performance benchmark.',
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
      "Refresh rate and frame pacing matter for FPS, but the best resolution/refresh/strobing combination is personal and hardware-dependent. BenQ ZOWIE's panel-side motion-blur reduction — older DyAC+ (XL2566K / XL2546K) and current DyAc 2 models — can improve clarity for some players. Compare supported modes, sustained frame pacing, strobe crosstalk, brightness, and comfort on the actual rig rather than treating one panel as a universal Fortnite choice.",
    items: [
      {
        name: 'BenQ ZOWIE XL2586X+ — 600 Hz + DyAc 2',
        price: '$$$',
        tier: 'goat',
        why:
          "Manufacturer-listed 600 Hz Fast-TN with DyAc 2 motion-blur reduction. It is a specialist choice for a rig that can sustain very high frame rates; compare the panel's supported modes, measured frame pacing, clarity, and comfort against a 360/500 Hz alternative before buying.",
        link: 'https://zowie.benq.com/en-us/monitor/xl2586x-plus.html',
      },
      {
        name: 'BenQ ZOWIE XL2566K — 360 Hz + DyAC+',
        price: '$550',
        tier: 'goat',
        why:
          'A 360 Hz TN option with DyAc+ motion-blur reduction. The small 24.5-inch format and strobing behavior suit some competitive players, but response, clarity, brightness, and strobe crosstalk are panel- and setting-dependent; compare it directly with current high-refresh IPS options.',
        link: 'https://zowie.benq.com/en-us/monitor/xl2566k.html',
      },
      {
        name: 'BenQ ZOWIE XL2546K — 240 Hz + DyAC+',
        price: '$400',
        tier: 'pro',
        why:
          'A 240 Hz TN option with DyAc+. It can be a sensible value choice when the rig and budget target a stable 240 Hz class experience, but a higher-refresh panel is not wasted if the system can sustain it; choose from measured frame pacing and panel behavior.',
        link: 'https://zowie.benq.com/en-us/monitor/xl2546k.html',
      },
      {
        name: 'Alienware AW2524HF (500 Hz IPS, no DyAC)',
        price: '$650',
        tier: 'pro',
        why:
          '500 Hz IPS at 1080p. It trades a different motion/clarity and color profile against strobing TN options; inspect measured response behavior and decide whether the extra refresh is visible and useful on your frame-pacing profile.',
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
          'For a latency-first Fortnite profile, compare HDR off and on with the same refresh, frame cap, and display mode. HDR can alter the display pipeline and image processing, but there is no universal fixed millisecond cost; keep the mode that measures and looks correct on the target display.',
      },
      {
        name: 'DyAC+ at full brightness — turn brightness DOWN',
        price: '—',
        tier: 'principle',
        why:
          'Backlight strobing changes brightness, crosstalk, and comfort. Use the manufacturer control and a repeatable motion test to find a brightness/strobe setting you can track with; there is no fixed percentage or universal best value.',
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
          'Large cloth mousepad option. Surface speed and stopping feel are personal; this category is comfort/control preference, not a guaranteed aim or latency improvement.',
        link: 'https://gamesense.gg/products/benjyfishy-radar',
      },
      {
        name: 'Artisan Hien (Mid)',
        price: '$50-65',
        tier: 'goat',
        why:
          "**What Diggy runs for Fortnite.** Japanese boutique. Mid-speed, balanced control + glide. Pick Hien Mid for Fortnite's flick-then-track motion; Soft is too slow, Xsoft is too floaty. Cult-favorite for low-sens players for a decade running.",
        caveat: 'Real Artisan ships from Japan (Amazon listings are mostly counterfeit). Order from artisan-jp.com/global or a verified reseller (e.g. JP Gaming in the US).',
        link: 'https://artisan-jp.com/global/fx-hien',
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
      'Choose adjustable gear that fits your body and setup. These are comfort ideas, not medical guidance or claims that a product prevents injury.',
    items: [
      {
        name: 'Wrist rest (optional comfort item)',
        price: '$10-25',
        tier: 'principle',
        why:
          'Only use a rest if it feels comfortable and does not force pressure on the wrist. Material preference is individual; this is not a treatment or injury-prevention device.',
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
          'Optional reminder to take a short break during long sessions. Choose a cadence that works for you; this is general wellbeing advice, not a medical prescription.',
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
