# Browsers for low input delay + low background CPU

**Verdict: [Brave](https://brave.com/download/) for daily, [LibreWolf](https://librewolf.net/) for power users. Avoid native [Chrome](https://www.google.com/chrome/) — it can no longer run the full [uBlock Origin](https://github.com/gorhill/uBlock) (Google disabled Manifest V2 by default in early 2025 and permanently removed it in Chrome 138 / July 2025), so Chrome users are left with the weaker [uBlock Origin Lite](https://github.com/uBlockOrigin/uBOL-home) (MV3). Full uBO — and the background-CPU savings this guide relies on — only survives on Brave, Firefox, and LibreWolf.**

## Why this matters for gaming
A browser open in the background is the largest single non-game CPU/GPU/memory consumer on most rigs. Ad/tracker scripts run constantly. Each tab is a process. Choice of browser directly impacts how many cycles your game can spend on frames.

## Comparison

| Browser | Engine | Background CPU | Input lag | Privacy default | Verdict |
|---|---|---|---|---|---|
| **[Brave](https://brave.com/download/)** | Chromium | Low (Shields kill ads/trackers) | Same as Chrome | Strong | **Default daily** |
| **[LibreWolf](https://librewolf.net/)** | Firefox | Lowest (Arkenfox hardened) | Slight latency vs Chromium | Strongest | **Power users / paranoid** |
| **[Vivaldi](https://vivaldi.com/)** | Chromium | Medium-high (heavy UI) | Same as Chrome | Decent | Skip |
| **[Chrome](https://www.google.com/chrome/)** | Chromium | High by default (ads, telemetry) | Baseline | Weak | Avoid — full uBO removed (MV2 killed in Chrome 138); only uBO Lite remains |
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
- Install **[uBlock Origin](https://github.com/gorhill/uBlock)** (full MV2 — works on Brave, Firefox, LibreWolf). On native **Chrome** the full version no longer loads (MV2 removed in Chrome 138, July 2025) — you can only run the reduced **[uBlock Origin Lite](https://github.com/uBlockOrigin/uBOL-home)** (MV3), which supports fewer filter lists and has no dynamic/cosmetic filtering.
- Disable Sponsored / Suggested in start page
- Set startup to "open blank page" not "restore tabs"

## Browser-side privacy stack we recommend
1. **[Brave](https://brave.com/download/)** with default Shields ON, fingerprinting "strict"
2. [uBlock Origin](https://github.com/gorhill/uBlock) (full MV2 — Brave still allows it; **not** native Chrome, which only gets uBO Lite) + [Bypass Paywalls Clean](https://gitflic.ru/project/magnolia1234/bpc_uploads)
3. [NextDNS](https://nextdns.io/) (DNS-level blocking before browser sees the request)
4. (Optional) [Pi-hole](https://pi-hole.net/) if you have a Pi or always-on PC

## Citations
- Browserbench Speedometer 3 + Jetstream 2 results (2024)
- DebugBear browser overhead studies
- Mozilla Telemetry baselines
- Chrome Manifest V2 / uBlock Origin deprecation: [The Next Web](https://thenextweb.com/news/chrome-manifest-v3-ublock-origin-content-blockers-disabled), [PCWorld — "the last lifeline for uBlock Origin in Chrome is almost gone"](https://www.pcworld.com/article/3160794/the-last-lifeline-for-ublock-origin-in-chrome-is-almost-gone-for-good.html), [AdGuard blog](https://adguard.com/en/blog/ublock-origin-disabled-chrome.html)
