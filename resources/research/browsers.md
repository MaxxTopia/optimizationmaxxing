# Browsers for low input delay + low background CPU

**Verdict: [Brave](https://brave.com/download/) for daily, [LibreWolf](https://librewolf.net/) for power users, native [Chrome](https://www.google.com/chrome/) only with uBlock Origin if you need extension compatibility.**

## Why this matters for gaming
A browser open in the background is the largest single non-game CPU/GPU/memory consumer on most rigs. Ad/tracker scripts run constantly. Each tab is a process. Choice of browser directly impacts how many cycles your game can spend on frames.

## Comparison

| Browser | Engine | Background CPU | Input lag | Privacy default | Verdict |
|---|---|---|---|---|---|
| **[Brave](https://brave.com/download/)** | Chromium | Low (Shields kill ads/trackers) | Same as Chrome | Strong | **Default daily** |
| **[LibreWolf](https://librewolf.net/)** | Firefox | Lowest (Arkenfox hardened) | Slight latency vs Chromium | Strongest | **Power users / paranoid** |
| **[Vivaldi](https://vivaldi.com/)** | Chromium | Medium-high (heavy UI) | Same as Chrome | Decent | Skip |
| **[Chrome](https://www.google.com/chrome/)** | Chromium | High by default (ads, telemetry) | Baseline | Weak | Only with uBlock Origin |
| **Edge** | Chromium | High (Bing/Copilot daemons) | Baseline | Weak | Avoid for gaming |
| **[Firefox](https://www.mozilla.org/firefox/new/)** | Gecko | Low | Slight latency vs Chromium | Medium | Privacy-leaning users |

## What "input delay in a browser" actually means
- Active-tab keyboard/mouse → DOM response: barely differs across modern engines (<5 ms variance)
- Background tab impact on game: HUGE. Heavy site like YouTube playing in a background tab = 5-15% sustained CPU on most desktops.
- Process count: Chrome with 10 tabs = 30+ processes. Brave Shields cut script execution = fewer wakeups.

## Hardening checklist (apply in any Chromium browser)
- Disable hardware acceleration if you see frame stutter while gaming with browser open (rare; benchmark first)
- Disable "Continue running background apps when browser is closed" (Settings → System)
- Block third-party cookies
- Install **[uBlock Origin](https://github.com/gorhill/uBlock)** (Chromium) or **[uBlock Origin Lite](https://github.com/uBlockOrigin/uBOL-home)** (MV3-compatible)
- Disable Sponsored / Suggested in start page
- Set startup to "open blank page" not "restore tabs"

## Browser-side privacy stack we recommend
1. **[Brave](https://brave.com/download/)** with default Shields ON, fingerprinting "strict"
2. [uBlock Origin](https://github.com/gorhill/uBlock) + [Bypass Paywalls Clean](https://gitflic.ru/project/magnolia1234/bpc_uploads)
3. [NextDNS](https://nextdns.io/) (DNS-level blocking before browser sees the request)
4. (Optional) [Pi-hole](https://pi-hole.net/) if you have a Pi or always-on PC

## Citations
- Browserbench Speedometer 3 + Jetstream 2 results (2024)
- DebugBear browser overhead studies
- Mozilla Telemetry baselines
