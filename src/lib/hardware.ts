/**
 * Hardware advisory — per-category tier ladders. Pulled from the same
 * sources as /grind (ProSettings.net pro configs + Aussie Antics' PT
 * background). Every item is something at least one cited pro currently
 * runs OR is a documented budget alternative the scene endorses.
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

/** Pulled from pro rig snapshots in /grind + ProSettings.net + community
 * scene consensus and vendor pages. Bump this when a category's evidence is
 * reviewed. Prices are intentionally not treated as live data. */
export const HARDWARE_LAST_VERIFIED = '2026-08-21'

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
          'Current flagship reference for a CPU-bound competitive build. 8 cores, 96MB 3D V-Cache, and a 5.6GHz advertised boost; independent game results vary by patch, memory, and settings, so treat the 9850X3D-versus-9800X3D gap as directional rather than a guaranteed Fortnite delta.',
        link: 'https://www.tomshardware.com/pc-components/cpus/amd-ryzen-7-9850x3d-vs-ryzen-7-9800x3d',
        citedPro: 'Most current FNCS top-100 builds',
      },
      {
        name: 'AMD Ryzen 7 9800X3D',
        price: '$479',
        tier: 'pro',
        why:
          'The value reference when the flagship premium is not justified. 8 cores, 96MB L3 (3D V-Cache stack), and a 5.2GHz advertised boost. Use current independent benchmarks for the game and patch you play; the percentage gap is not portable across every rig. Unlocked for PBO + Curve Optimizer, which still requires stability and temperature testing.',
        link: 'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9800x3d.html',
        citedPro: 'Most current FNCS top-100 builds',
      },
      {
        name: 'AMD Ryzen 7 7800X3D',
        price: '$359',
        tier: 'pro',
        why:
          'Last-gen GOAT, still 90-95% of the 9800X3D in Fortnite for $120 less. 8 cores, 96MB L3. Best single buy on AM5 right now if you don\'t need the absolute ceiling — drop it in any X670/B650 board.',
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
      "Fortnite is rarely GPU-bound at 1080p competitive (Performance mode renders at half-res). What matters is driver maturity (NVIDIA wins by a mile on UE5 day-one) and Reflex-on-BOOST support. Spend the $1500+ tier money on monitors + chair before you spend it on the GPU.",
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
          'A tight-timing reference kit. IC labeling and stable timings can vary by batch and memory controller; use the /guides recipe only as a conservative starting point, never as a guaranteed CL26 or voltage instruction. Test every BIOS change.',
        link: 'https://www.gskill.com/product/165/390/1726195627/F5-6000J2836G16GX2-TR5RKE',
      },
      {
        name: 'Corsair Vengeance 32GB DDR5-6000 CL30',
        price: '$340-$370',
        tier: 'pro',
        why:
          'AMD EXPO + Intel XMP both on the SPD. Hynix M-die or A-die depending on stocked batch (check Thaiphoon Burner before tightening). The most-bought 6000 CL30 kit on AM5 builds.',
      },
      {
        name: 'Kingston Fury Beast 32GB DDR5-6000 CL36',
        price: '$270-$300',
        tier: 'budget',
        why:
          'The "just works" budget kit. CL36 isn\'t tightening territory but it boots EXPO-on across every AM5 board on first POST. Upgrade timings in BIOS later if you want; the kit is what it is.',
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
          'AM5, X870E chipset, PCIe Gen5 GPU + Gen5 NVMe. Robust 18+2+2 power stage handles 9950X3D at PBO max. AI Suite is bloated — disable it via our /tweaks `peripherals.*.autostart-disable` row after install.',
      },
      {
        name: 'MSI MAG B650 Tomahawk WiFi',
        price: '$229',
        tier: 'pro',
        why:
          'B650 is fine for 9800X3D (PBO unlocks anyway, the X670E premium is for productivity rigs). 14+2+1 VRM, DDR5-6800+ supported, 2.5GbE. The competitive build sweet spot.',
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
          'PCIe Gen5 12-14 GB/s. Useless for Fortnite — game load is bottlenecked by Epic\'s pak file decryption, not SSD bandwidth. Buy for productivity workloads, not for the game.',
      },
    ],
  },
  {
    id: 'cooling',
    label: 'Cooling',
    blurb:
      "X3D parts run cool because the cache stacks under the cores (Zen 5). A 240mm AIO is overkill for 9800X3D thermal envelope. Spend the cooling budget on case airflow + GPU undervolt instead.",
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
          'Twin-tower air cooler that beats most 240mm AIOs at a tenth the price. Handles 9800X3D + non-overclocked Intel parts. No pump to fail in 4 years.',
      },
      {
        name: 'Noctua NH-D15S G2',
        price: '$169',
        tier: 'pro',
        why:
          'The premium air-cool answer. Beats most 360mm AIOs, completely silent, lasts forever. Brown fans clash with every aesthetic build — chromax black version if it matters.',
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
      "Wired headset > wireless for competitive (wireless adds 5-30ms of audio buffering depending on codec). Footstep direction matters more than music fidelity. Pros are split across HyperX Cloud + Astro A40 + Sennheiser HD 6XX.",
    items: [
      {
        name: 'HyperX Cloud Alpha S',
        price: '$129',
        tier: 'goat',
        why:
          'Pro-default. Wired, 3.5mm + USB-C DAC, dual chambers for sub-bass control on footstep frequencies. Reet runs this. Comfortable for 6+ hour sessions.',
        citedPro: 'Reet',
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
      "Lightest-possible body + flagship sensor. Sub-60g is the converged-mechanics standard. Polling 1000 Hz minimum (8K Hz on current Razer/Logitech flagships). Every cited GOAT runs in the same band.",
    items: [
      {
        name: 'Logitech G PRO X Superlight 2',
        price: '$159',
        tier: 'goat',
        why:
          '60g, HERO 2 sensor (44K DPI, 888 IPS), now with 8K polling. Industry-default — Peterbot, Reet, and a large slice of the active FNCS field. Wireless dongle is sub-1ms latency.',
        citedPro: 'Peterbot',
        link: 'https://www.logitechg.com/en-us/products/gaming-mice/pro-x-superlight-2.html',
        caveat: 'White colorway has a known coating wear after 6+ months of heavy use. Black holds up.',
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
      "Refresh rate matters more than resolution for FPS. 1080p @ 240+ Hz is the converged pro choice. The other lever pros now obsess over: BenQ ZOWIE's panel-side motion-blur reduction — older DyAC+ (XL2566K / XL2546K, still what most Fortnite pros run) and the current **DyAc 2** generation (XL2566X+ 400Hz, XL2586X 540Hz, XL2586X+ 600Hz flagship). It strobes the backlight in sync with the refresh — eliminates trail-blur on tracking moves at the panel level, not via driver. Once you've tracked an enemy with DyAc on, going back to a regular IPS feels like dragging a smear.",
    items: [
      {
        name: 'BenQ ZOWIE XL2586X+ — 600 Hz + DyAc 2',
        price: '$$$',
        tier: 'goat',
        why:
          "BenQ ZOWIE's current flagship. 600 Hz Fast-TN with the new DyAc 2 motion-blur reduction (the XL2586X 540Hz and XL2566X+ 400Hz round out the DyAc 2 lineup). The true top tier now — though Fortnite caps at 240 FPS, so the proven XL2566K below is still all most pros run.",
        link: 'https://zowie.benq.com/en-us/monitor/xl2586x-plus.html',
      },
      {
        name: 'BenQ ZOWIE XL2566K — 360 Hz + DyAC+',
        price: '$550',
        tier: 'goat',
        why:
          'The proven Fortnite pick — still the #2 most-used monitor among pros and **what Peterbot runs** — now one generation behind ZOWIE\'s DyAc 2 flagships. 360 Hz TN panel with DyAC+ motion-blur reduction. TN sounds dated but at 360 Hz + DyAC+ the response time + motion clarity beats every IPS at this price. Small panel (24.5") on purpose — pro-eye-distance.',
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
