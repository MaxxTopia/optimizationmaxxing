/**
 * Hardcoded changelog. Surfaced via the What's-New modal on first launch
 * after an upgrade. Keep entries short — bullets, not paragraphs. Newest
 * first. The current app version comes from package.json via Vite.
 */

export interface ChangelogEntry {
  version: string
  date: string
  highlights: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.82',
    date: '2026-05-12',
    highlights: [
      'NEW **Disable RGB control apps at startup** — single tweak sweeps Run / RunOnce keys across HKCU + HKLM (incl. WOW6432Node) **and** Windows scheduled tasks, matching ~25 keywords across every major RGB vendor: Asus Aura / Armoury Crate, Corsair iCUE, MSI Mystic Light / MSI Center, Gigabyte RGB Fusion / AORUS, Razer Synapse, Logitech G HUB, T-Force Blitz, NZXT CAM, EVGA Precision X1, Cooler Master MasterPlus, OpenRGB, SignalRGB, OMEN Lighting Studio, AlienFX. Pre-state stashes to `%LOCALAPPDATA%\\\\optmaxxing\\\\backups\\\\rgb-autostart-stash.json` so revert restores every Run-key value byte-for-byte and re-enables every disabled task. The apps still launch on demand — they just don\'t auto-spawn at login. Real DPC + USB-polling tax recovery (iCUE + Synapse are the documented worst offenders).',
      'NEW **/guides/rgb-shutoff — turn LEDs off persistently, no software running** — companion articleware to the new tweak. Opens with the honest claim audit (LEDs themselves don\'t cause measurable input delay; vendor software polling does), then the T-Force RAM-specific save-to-flash workflow (install Blitz → set black → Save to Flash → uninstall — LEDs stay off forever), per-vendor BIOS RGB toggle paths (ASUS / MSI / Gigabyte / ASRock), GPU / AIO / peripheral save-to-flash playbooks, OpenRGB fallback with explicit "don\'t run during ranked" anti-cheat caveat, and the unplug-the-header last resort.',
    ],
  },
  {
    version: '0.1.81',
    date: '2026-05-11',
    highlights: [
      'NEW **VIP code subscription + product-scope schema (v0.6)** — the shared vip-worker now reads per-code metadata (tier, scope, durationMs) from KV, written at mint time by the new `/gen` / `/om` / `/33` slash commands in the Maxxtopia tickets-worker. OM lifetime codes (scope="om") get rejected if claimed via Discordmaxxer; DM subscription codes (scope="dm") get rejected if claimed via Optimizationmaxxing; founder codes are scope="both" and work for both products. Time-bound subscriptions (monthly/annual) get an expiresAt timestamp at first claim — local binding cache auto-drops to FREE once we\'re past expiry, no network round-trip needed.',
      'BACKEND **client sends `product: "om"` on every /claim** — the worker uses this to enforce code scope. Legacy codes minted before the schema upgrade have no scope metadata; the worker treats them as scope="both" so old codes still work everywhere.',
      'BACKEND **claim response carries `tier`, `expiresAt`, `scope`** — the WorkerJson + ClaimResult structs now propagate these through. New status codes surfaced: "scope-mismatch" (403 — wrong product) and "expired" (410 — subscription elapsed).',
    ],
  },
  {
    version: '0.1.80',
    date: '2026-05-11',
    highlights: [
      'NEW **Maximize HDMI / monitor refresh rate** — single-click tweak that walks every attached display, queries the highest refresh rate Windows says is supported at the current resolution, and locks it in. Native ChangeDisplaySettingsExW Win32 call from Rust — **no UAC prompt** (per-user setting), instantly reversible from /diff, idempotent (a re-apply on an already-maxed monitor is a no-op). Two-phase TEST → APPLY guard so a cable / EDID that can\'t actually handle the requested mode is rejected cleanly instead of dropping the display off-signal. The most common cause of "I bought a 240Hz monitor and it\'s only running at 60Hz" is Windows defaulting to a lower mode after a driver swap; this nukes that in one click. Categorized under display, free tier, AC-safe across all anticheats.',
      'NEW **DisplayRefresh engine action** — fifth TweakAction variant (after RegistrySet / RegistryDelete / BcdeditSet / PowershellScript / FileWrite). First non-registry/non-script native Windows API call in the engine. Pre-state captures the original mode of every matched display per device, so the revert path replays exactly what you had before — even if you applied across multiple monitors with mixed refresh rates.',
    ],
  },
  {
    version: '0.1.79',
    date: '2026-05-11',
    highlights: [
      'BUG-FIX **External links did nothing inside the desktop app** — every "open Discord / pon.wiki / liquipedia / mailto" link in the app was a silent no-op in the Tauri webview because window.open()/<a target="_blank"> calls get swallowed unless explicitly routed through the shell plugin. plugin-shell was already a dependency + permission was already in capabilities/default.json — but no code actually imported it. Fix: new openExternal() helper in lib/tauri.ts, swapped at every window.open callsite (sidebar M, sidebar per-product items, Pricing ticket button, VIP redemption Discord-link button, Suggest-tweak email button). Plus a global anchor interceptor in App.tsx that catches ALL 32 `<a target="_blank">` links across the catalog without touching their JSX — pon.wiki, liquipedia, exen.sh, github, /research links, etc. all open in the system browser now.',
      'BUG-FIX **Detect Stick "show per-URL attempts" expander was empty** — the v0.1.77 discovery script used `ForEach-Object -Parallel`, which is **PowerShell 7+ only**. Windows ships PS 5.1, so on stock rigs the param was unknown, the pipeline errored, $results was $null, and the attempts list rendered empty — making it look like nothing was tried. Rewrote as sequential probes (5 candidates × 2s timeout = max 10s, but short-circuits on first success — typically 2-4s). Plus: if the script still ends up returning zero attempts in the future, we surface stderr (or the raw stdout) as a single diagnostic pseudo-entry so the expander always shows *something*.',
      'BUG-FIX **LibreHardwareMonitor probe "argument drive is null"** — Tauri\'s resource_dir() returns Windows extended-length paths with the `\\\\?\\` prefix in installed (NSIS) builds. PowerShell\'s `Split-Path` can\'t parse the prefix → returned null → `Join-Path null` errored → LHM never loaded → fell back to ACPI sensors with the LHM-failed banner shown. Fix: strip the verbatim-prefix in Rust (lib.rs::strip_verbatim_prefix) AND swap `Split-Path $DllPath` for `[System.IO.Path]::GetDirectoryName($DllPath)` in read_sensors.ps1 (handles both path styles). Belt + suspenders so future Tauri path-handling changes don\'t reopen this.',
      'UX **Post-apply "next steps" banner** — once you\'ve applied ≥ 5 tweaks, a gold-tinted card surfaces above the Tweaks list pointing at the three highest-leverage things that live OUTSIDE the catalog (because they\'re external tools or BIOS-tier articleware): NVIDIA Profile Inspector, Standby memory cleaner, SCEWIN / BIOS tuning. Each links into the matching /guides article. Dismissible — comes back after 30 days in case you install a fresh tweak pack and want a reminder. Fixes the "applied everything → moved on → never explored guides" drop-off.',
      'UX **Admin-prompt explainer above the Tweaks list** — single line above the catalog telling first-time users that *some tweaks need admin*, Windows pops a single UAC dialog when you click Apply, and click Yes to run the whole batch in one shot. Plus a reminder that every tweak is reversible from /diff. Combined with v0.1.78\'s HKCU\\Software\\Policies routing this finally gives standard-user friends a smooth first run.',
    ],
  },
  {
    version: '0.1.78',
    date: '2026-05-10',
    highlights: [
      'BUG-FIX **VIP redemption "wrong code or fingerprint" on standard-user PCs** — the worker round-trip happens via PowerShell + Invoke-WebRequest, which on un-patched Windows 10 LTSC / older 5.1 builds defaults `ServicePointManager.SecurityProtocol` to SSL3+TLS 1.0. Cloudflare flat-out rejects sub-1.2 → claim died with "Could not create SSL/TLS secure channel" and we silently fell through to the offline HMAC verify (which only works for the older HWID-bound code flavor). Now: script forces TLS 1.2+ via `-bor [Net.SecurityProtocolType]::Tls12` before the request. Also: the fail card now exposes a "what failed" details pane (online-status + worker-error + offline-HMAC outcome) so you can paste the exact diagnostic into a DM instead of paraphrasing.',
      'BUG-FIX **"create_subkey access is denied" when applying tweaks as a standard user** — three catalog tweaks (Edge background mode, Bing search-box suggestions, Cloud-content consumer features) write to `HKCU\\Software\\Policies\\*`, which Windows hardens with an admin-only ACL even though it lives under HKEY_CURRENT_USER. The engine was running them in-process unelevated → instant access-denied. Now: `requires_admin()` flags every `HKCU\\Software\\Policies\\*` action so they route through the existing UAC batch (one prompt). Side benefit: the in-process registry path now translates raw winreg PermissionDenied into an actionable message ("relaunch as administrator") instead of bare "create_subkey ...: Access is denied".',
    ],
  },
  {
    version: '0.1.77',
    date: '2026-05-10',
    highlights: [
      'NEW **🔍 Detect stick auto-discovery for the XGS-PON ONU monitor** — new button next to the URL input fires off parallel HTTPS probes against the 5 well-known stick management URLs (192.168.11.1, 192.168.1.252, 192.168.100.1, 192.168.5.1, 10.0.0.1 — the documented endpoints across 8311 firmware / Hisense / BFW / pfSense-bridged setups). 2-second timeout per candidate, all fired in parallel via PowerShell ForEach-Object -Parallel. First HTTP-200 wins → URL auto-fills + an immediate poll fires so you see metrics with one click instead of three.',
      'BETTER EMPTY STATE **for users without a stick** — if Detect finds nothing, surface a clean "no stick detected on your subnet" message + a collapsible per-URL diagnostic showing exactly which IPs we tried + how long each took + what error each returned. Two clear paths follow: "don\'t have one? expected" vs "do have one? see pon.wiki for routing".',
      'Lifts the manual setup floor for the ~10% of users who DO have a stick: previously they had to look up + paste the right URL by hand; now Detect fills it for any of the 5 documented configurations.',
    ],
  },
  {
    version: '0.1.76',
    date: '2026-05-10',
    highlights: [
      'UX **One-click "Update task" banner for the standby cleaner** — v0.1.74 fixed the PowerShell-window flash by switching to a `wscript.exe` shim, but existing scheduled tasks created by v0.1.63-v0.1.73 still had the OLD direct-PowerShell command stored in their /TR field. Required users to manually Uninstall→Install via the Settings UI to pick up the new launcher. Now: Settings page detects on mount whether the existing task is using the old format (parses `schtasks /Query /V /FO LIST` for the Task To Run line + Repeat interval), and surfaces a yellow ⚡ banner above the standby card with a single "Update task" button. One UAC prompt, same interval preserved, banner disappears once re-registered. v0.1.74 + v0.1.75 users can now skip the manual dance.',
    ],
  },
  {
    version: '0.1.75',
    date: '2026-05-10',
    highlights: [
      'BUG-FIX **XGS-PON ONU stick error message readable** — when the stick was unreachable, the surfaced error included the entire PowerShell script body wrapped in Write-Error\'s verbose context formatter. Underlying error was a clean "The operation has timed out" but it got buried inside ~10 lines of script-body-as-context noise. Swapped `Write-Error $_.Exception.Message` for `[Console]::Error.WriteLine($_.Exception.Message)` — clean stderr write, no script-body wrapper. Now you see "The operation has timed out" + the helper "you don\'t have one? ignore this card" copy, not a wall of script.',
    ],
  },
  {
    version: '0.1.74',
    date: '2026-05-10',
    highlights: [
      'BUG-FIX **Standby cleaner no longer flashes a console window every interval** — the scheduled task ran `powershell.exe -WindowStyle Hidden` directly, but PowerShell can only hide the window AFTER it first paints. Task Scheduler triggered the paint, then PowerShell saw the flag too late → 100-300ms flash every 5 minutes (or whatever interval you picked). Fix: wraps the call in a tiny `wscript.exe` + `hide_launcher.vbs` shim. wscript is windowless from start, the .vbs spawns PowerShell with `SW_HIDE` so there\'s nothing to flash. **You need to re-install the cleaner once after upgrading** — Settings → Standby cleaner → Uninstall, then Install again. Existing scheduled tasks created by v0.1.73 and earlier still use the old direct-powershell command and will keep flashing until re-registered.',
    ],
  },
  {
    version: '0.1.73',
    date: '2026-05-10',
    highlights: [
      'BUG-FIX **Bufferbloat probe** — previous PowerShell used `Start-Job` for the parallel download, then `Wait-Job | Receive-Job | Select-Object -Last 1` to grab the byte total. Two failure modes baked in: (1) Receive-Job returns the FULL pipeline output of the job, not just the function return — Select-Object -Last 1 would grab whatever was written last (often $null or a stream object), giving us 0 bytes + corrupted JSON; (2) Start-Job spawned a fresh PowerShell process per call, ~1.5s of pure overhead. Rewritten as single-process: HttpClient.GetAsync with ResponseHeadersRead + chunked Read in the foreground, ping every ~700ms during the read loop. Deterministic timing, deterministic output, surfaces script-side errors back to the UI ("HTTP 503", "GET timed out") instead of going blank.',
      'UX **XGS-PON ONU stick monitor** — clarified the card is niche (XGS-PON SFP+ stick users only). "Couldn\'t reach the stick" error message now distinguishes between "you don\'t have one — ignore this card" vs "you do have one — here\'s the troubleshooting" with a link to pon.wiki. Most home users don\'t have an 8311 stick; the error was reading like a bug instead of "not your situation".',
      'CONTENT **Game core pinning explanation expanded** — the /settings card now explains in plain English what CPU Sets do (run game on these cores, everything else on the OTHER cores), why it beats legacy affinity masks (real reservation, not just constraint), and adds a recommended-for-Fortnite section: P-cores only on Intel hybrid (E-cores hurt UE5), CCD0 only on AMD X3D (cross-CCD latency murders Fortnite), "all" fine on non-X3D Ryzen + Intel non-hybrid. "Bottom half" preset is the right default for most competitive rigs.',
      'CONTENT **Auto-pin daemon explanation expanded** — same plain-English treatment + Fortnite-specific 4-step setup: add the FortniteClient quick-pick → pick cores per CPU class (P-cores on Intel hybrid, cores 0-7 on X3D, all on non-X3D Ryzen, all on Intel non-hybrid) → flip daemon ON → launch normally. Verify via Task Manager → Details → Set affinity.',
      'BRAND **Discordmaxxer logo refreshed** — the suite-rail logo on the left was the old white silhouette mark. Swapped for the current horror-Clyde primary mark (with bullet holes) — same one shipping in the discordmaxxer client itself. Also updated on maxxtopia.com.',
    ],
  },
  {
    version: '0.1.72',
    date: '2026-05-10',
    highlights: [
      'CONTENT **/grind cards expanded** — Khanada / Reet / Clix all rewritten with cited, current facts.',
      '**Khanada** — added the 1st-place finish at **FNCS 2026 Major 1 NA West Grand Finals** with VicterV (Dignitas duo, 160 points clear of 2nd, $30K each, two Victory Royales en route) per Sportskeeda + Liquipedia event log.',
      '**Reet** — career bag $400,680 across 100+ tournaments (Esports Earnings); biggest single payout $45K at FNCS Major 2 2024 NA Grand Finals (2nd with Ritual). Two outright NA West FNCS wins (C2S8 + 2021 Grand Royale). Documented mouse + binds via ProSettings: Logitech G Pro X Superlight 2 @ 800 DPI, 6.4% sens.',
      '**Clix** — added the 2024 Forbes 30 Under 30 (youngest member) credential, the business stack (Dr3amin apparel / Clix Creative UEFN studio / co-owns XSET), and the recent FNCS placements: 2nd at FNCS Major 2 2025 NA Central ($25.5K), 4th at Major 1 + Major 3 2024 NA ($30K each), 3rd at Major 1 2025 NA Central ($17K). Career-biggest single payout $112,500 from 2019 World Cup Solo Finals at age 14.',
    ],
  },
  {
    version: '0.1.71',
    date: '2026-05-10',
    highlights: [
      'BUG-FIX **GPU spec detection now survives capture-card / driver-reload edge cases** — `Win32_VideoController` can return rows where the only display device is "Microsoft Basic Display Adapter" (during a driver reload), or a capture-card-registered display (Elgato / AverMedia). Previous filter rejected all of those, blowing up spec detection with "no usable Win32_VideoController row found" even though there WAS a row OM could have used. Added a fallback path: if the strict filter empties everything, accept the largest non-empty row. Also: better error when WMI returns 0 rows ("WMI service likely sick — `net stop winmgmt /y && net start winmgmt`").',
      'CONTENT **/grind cards rewritten — Bugha, Reet, Clix, Th0masHD** — stripped unverified superlatives ("best in world", "best aimer per scene consensus", "most-watched arena pro") and kept only citation-backed facts. Bugha = Solo World Cup champion 2019 + the FNCS Major 1 DQ + Epic\'s reversal (cited). Reet = bind layout from specs.gg. Clix = ProSettings + duelmasters.io routine. Th0masHD = Virtus.pro long tenure + Liquipedia event history. Shorter cards, all sourced.',
    ],
  },
  {
    version: '0.1.70',
    date: '2026-05-10',
    highlights: [
      'BUG-FIX **"Apply All" silent skip-on-failure** — every elevated batch (HKLM / BCD / PS / FileWrite-to-admin-path) was joined with cmd.exe `&&`, which is **short-circuit**: the first command that exited non-zero silently skipped every command after it. Diggy hit this with 50+ HKLM tweaks queued — one tweak hits a Group Policy lock, the remaining 30+ silently no-op, audit shows them as "would change" because they were never applied. Fix: write a per-line `.cmd` script to TEMP, run each line independently, log failures, exit code = failure count. Caller surfaces "X of Y commands failed — first few:" instead of silent skip. Side benefit: eliminates cmd.exe\'s 8191-char arg limit which the "Apply All" path was approaching.',
      'CONTENT **/grind Khanada card** — removed the controller-player labeling per Diggy. Card now leans on his actual durable credential: long-tenured top-tier across multiple chapter resets — staying competitive through three chapter overhauls (each resets meta + mechanics) is the rarer credential than peak skill in any one meta.',
      'CONTENT **/guides reordering** — advanced + highest-leverage guides at the top (NVPI / SCEWIN / BIOS-per-chipset / tournament compliance / DSCP router companion / latency budget / standby cleaner). High-impact basics next (Reflex / AMD-Intel / per-game Windows / Fortnite + Valorant pro settings / mice / grind layer / gear). Niche + troubleshooting last (WinRing0 AV / Discord low-FPS / browsers / lightweight distros).',
      'CONTENT **NVCleanstall step-by-step in Toolkit Driver Advisor** — replaced the 1-paragraph mention with a 6-step numbered guide: which driver to pick, which components to keep vs strip (Display + PhysX + HD Audio if HDMI), which Tweaks to flip on (telemetry off, Ansel off, HDCP off, Perform Clean Install on), and the chained NVPI step. Stripped install drops idle RAM 80-150 MB + kills GFE background services.',
    ],
  },
  {
    version: '0.1.69',
    date: '2026-05-10',
    highlights: [
      'HOTFIX **App-launch crash fix** — v0.1.67 panicked on every startup at `auto_pin.rs:107` ("there is no reactor running") because the v0.1.66 daemon scheduled itself with `tokio::task::spawn` from inside Tauri\'s synchronous `setup` closure, before the tokio runtime came up. Now uses `tauri::async_runtime::spawn`, which is safe to call from any context. Crash logged at `%LOCALAPPDATA%\\\\com.maxxers.optimizationmaxxing\\\\crashes\\\\` if you want to verify the boot loop matches.',
      'CI-FIX **NSIS installer hook now committed** — `installer-hooks.nsh` was referenced by `tauri.conf.json` but never staged in the v0.1.68 attempt, so CI failed at the bundling step ("system cannot find the file specified"). Hook itself wipes the per-user IconCache.db on install/uninstall via `ie4uinit.exe -ClearIconCache` so upgrades don\'t inherit a stale Start-Menu icon. v0.1.68 release was draft-only — no artifact ever shipped — so this is the first downloadable build with the boot-crash fix.',
    ],
  },
  {
    version: '0.1.67',
    date: '2026-05-10',
    highlights: [
      'CONTENT **/grind Veno card** — 5th verbatim quote added per Diggy: **"Fuck off the region nigga, this is my region boy!"** Said at the **2026 Esports World Cup playing on EU with Curve** (2026-05-08). Cross-region history made literal — the NA-based, EU-origin pro defending his territorial claim on the same EU scrim ladder where he started his career.',
    ],
  },
  {
    version: '0.1.66',
    date: '2026-05-10',
    highlights: [
      'NEW **Per-game-name auto-pin daemon** — the v0.1.65 click-to-pin gets a daemon. New section in /settings (below click-to-pin): add rules for {processName, cores}, toggle daemon ON, every N seconds (default 5) the Rust-side polling task watches for matching game processes and pins them via SetProcessDefaultCpuSets. Set-and-forget. Config persists to %LOCALAPPDATA%\\\\optmaxxing\\\\auto-pin.json across app restarts. UI surfaces last-poll timestamp + currently-pinned PID list (live, refreshes every 5s while running).',
      'New Rust module **auto_pin.rs** — long-running tokio task spawned at app startup. Static CONFIG + STATUS via parking_lot::Mutex + OnceLock. Uses sysinfo to enumerate processes by name. Tracks pinned PIDs to avoid re-pinning + drops dead PIDs from tracking each cycle. 3 new Tauri commands: auto_pin_status / auto_pin_get_config / auto_pin_set_config.',
      'Quick-picker UI ships common-game presets (Fortnite / Valorant / CS2 / Apex / OW2 / Warzone) with their canonical .exe names plus a "+ custom" prompt for anything else. Per-rule core picker reuses the same per-core toggle UI as click-to-pin.',
      'No UAC needed for the daemon — sysinfo + OpenProcess(PROCESS_SET_INFORMATION) work unelevated as long as the game wasn\'t launched with elevated privileges itself. Anti-cheat-safe: same SetProcessDefaultCpuSets path as v0.1.65.',
    ],
  },
  {
    version: '0.1.65',
    date: '2026-05-10',
    highlights: [
      'NEW **Game core pinning (CPU Sets API)** — section in /settings. Modern Windows API (`SetProcessDefaultCpuSets`, Win10 1709+) — categorically better than legacy affinity masks because the scheduler treats off-set cores as unavailable for the pinned process AND prefers them for everything else. Net effect: your game gets cores effectively reserved instead of just constrained. UI: per-core toggle picker + presets (bottom half / top half / last 4 / all) + "Pin foreground game" button (we grab GetForegroundWindow → PID → SetProcessDefaultCpuSets) + active-pins list with per-pin "clear" buttons. Pin survives in OS scheduler until process exits.',
      'NEW Rust module **cpusets.rs** — wraps GetForegroundWindow / GetWindowThreadProcessId / OpenProcess / SetProcessDefaultCpuSets / GetModuleBaseNameW. Four new Tauri commands: cpu_set_info / cpu_pin_foreground / cpu_pin_pid / cpu_clear_pin.',
      'CONTENT **AC matrix audit pass round 2** — 12→18 tagged tweaks. Game-specific IFEO priority tweaks tagged explicit safe (process.fortnite.priority-high → eac/epic_ac safe; process.valorant.priority-high → vanguard safe; process.cs2.priority-high → vac/faceit/esea safe). Universal-safe v0.1.62 tweaks tagged across all 7 ACs (display.mpo.disable, network.tcp.ack-nodelay, network.qos.dscp-tag) so users see green pills. Catalog v1.8.1 → v1.8.2.',
      'Per-game-name auto-pin daemon DEFERRED to v0.1.66+ — current pinning is one-shot click-to-pin per game launch. Surviving relaunch needs a polling daemon that watches for game-process names and pins automatically.',
    ],
  },
  {
    version: '0.1.64',
    date: '2026-05-10',
    highlights: [
      'NEW **Tournament Mode** — temporal AC compliance toggle on /asta. Pick a game, set a match-start time, choose buffer minutes (default: revert at T-5min, restore at T+30min). At T-N: batch-reverts every applied tweak the chosen game\'s anti-cheat would flag. At T+M: re-applies the same set. Survives app restarts via localStorage. Polled every 15s. Removes the manual 5-min ritual most pros do before every Vanguard / BattlEye scrim. Preview panel shows exactly which tweaks will be reverted before you commit.',
      'CONTENT **Per-AC matrix audit pass** — 9 new tweaks tagged (3 → 12 total). Risk-tagged: cpu-mitigations.disable-DANGER (vanguard/battleye/faceit/esea risk), exception-chain-validation.disable (vanguard/faceit), global-timer-resolution.allow (battleye), useplatformclock.disable (battleye), disabledynamictick.yes (battleye). Safe-tagged so users see the green pill: cs2.autoexec.optimize (vac/faceit/esea safe), apex.videoconfig.optimize (eac safe), fortnite.engine-ini.optimize (eac/epic_ac safe), fortnite.gus-ini.competitive (eac/epic_ac safe). Catalog v1.8.0 → v1.8.1.',
      'Tournament Mode reads anticheatCompatibility first; falls back to tournamentCompliance[game] if no per-AC verdict. So even untagged tweaks with a tournamentCompliance entry still get reverted correctly when the user activates the mode.',
    ],
  },
  {
    version: '0.1.63',
    date: '2026-05-10',
    highlights: [
      'NEW **Background standby cleaner** — integrated. New section in /settings: ONE UAC prompt registers a Windows scheduled task that calls `NtSetSystemInformation(MemoryPurgeStandbyList)` every 1/2/5 minutes. Same syscall RAMMap (Sysinternals) and Wagnard\'s ISLC use. Anti-cheat-safe: no driver, no kernel hooks, no game-process injection. PowerShell does the syscall via inline C# P/Invoke + EnablePrivilege(SeProfileSingleProcessPrivilege). After install, task runs silently on schedule. UI surfaces last-cleaned timestamp + "Run now" button + log file path. Removes the need for ISLC-as-3rd-party-tool that the v0.1.62 standby guide pointed users to.',
      'NEW **Per-anti-cheat compatibility matrix** — schema groundwork. New `AnticheatCompatibility` type on `TweakRecord` lets us tag tweaks against Vanguard / EAC / BattlEye / VAC / FACEIT / ESEA / Epic AC independently of game-tournament compliance. `/tweaks` page gains an "Anti-cheat:" filter chip row + "hide tweaks <AC> flags" toggle. Initial tagging on the most AC-relevant catalog entries: HVCI off (vanguard/battleye/faceit risk), Hyper-V off (vanguard/faceit risk), HPET disable (battleye risk). Full audit pass to expand coverage is incremental.',
      'Standby cleaner ships the `clear_standby.ps1` resource (bundled in installer). 4 new Tauri commands: `standby_install / _uninstall / _run_now / _status`. Closes the v0.1.62 articleware-only deferral.',
    ],
  },
  {
    version: '0.1.62',
    date: '2026-05-10',
    highlights: [
      'NEW catalog tweak **MPO disable** — `OverlayTestMode = 5` HKLM. Fixes the dual-monitor / multi-display stutter that has plagued NVIDIA + Intel Arc users since 2022. Most pros run dual-monitor (game + Discord/OBS) — disabling MPO eliminates a stutter source most users never trace. Single registry value, instantly reversible.',
      'NEW catalog tweak **TCP ACK frequency + Nagle off (per-NIC)** — PowerShell script that iterates HKLM\\\\SYSTEM\\\\CurrentControlSet\\\\Services\\\\Tcpip\\\\Parameters\\\\Interfaces and sets `TcpAckFrequency = 1` + `TCPNoDelay = 1` on every NIC with a bound IP. Pro-circulated network tweak documented on r/CompetitiveApex for years but absent from every mainstream optimizer. Reverts cleanly via the inverse script.',
      'NEW catalog tweak **DSCP / QoS packet tagging** (VIP) — `New-NetQosPolicy` rules tag outbound Fortnite/CS2/Valorant/Apex traffic with DSCP 46 (Expedited Forwarding). The single most-gatekept network tweak in pro-circle Discords; nobody publishes guides on it. Useless without a router that honors DSCP — companion guide covers ASUS / Netgear / TP-Link / Ubiquiti / pfSense / OpenWRT setup.',
      'NEW guide **NVIDIA Profile Inspector — gatekept .nip files** — articleware on Calypto + community .nip profiles. Real 10-50ms wins via undocumented NVCP flags (Threaded Optimization OFF for Fortnite, FRL v3 mode for CS2, per-app prefer-max-performance for Valorant). Per-game callouts for Fortnite/CS2/Valorant/Apex. Tagged advanced.',
      'NEW guide **Standby memory list — silent stutter pros clean every session** — explains why pros restart their game every 2-3 hours, links to ISLC (Wagnard) + Microsoft\'s RAMMap as the proven manual paths. Integrated standby cleaner with scheduled-task elevation ships v0.1.63+.',
      'NEW guide **DSCP / QoS router companion** — per-router setup for the catalog\'s QoS tweak. Covers ASUS Adaptive QoS, Netgear Dynamic QoS, TP-Link Archer, Ubiquiti UniFi (Smart Queues / CAKE), pfSense Traffic Shaper, OpenWRT SQM. Tagged advanced.',
      'Catalog version v1.7.4 → v1.8.0 (97 tweaks total).',
    ],
  },
  {
    version: '0.1.61',
    date: '2026-05-10',
    highlights: [
      'CONTENT **/grind Veno card** — four verbatim quotes added per Diggy\'s recall: the unfiltered stream catchphrase ("We going for that #1 NIGGA"), the work-ethic line ("If you want to be able to buy things without looking at the price, you need to be able to work without looking at the clock"), the Peterbot-vs-LeBron engagement ("Is skinny Pete better than Bron all time?"), and the TKay Spider-Man reply ("Stupid question nigga"). Closes the v0.1.60 TODO marker.',
    ],
  },
  {
    version: '0.1.60',
    date: '2026-05-10',
    highlights: [
      'BUG-FIX **LibreHardwareMonitor probe** — was crashing with "argument \'drive\' is null" inside LHM\'s storage enumerator on rigs with locked BitLocker volumes / removable USB / 8+ drives. Storage subsystem is now disabled by default (we don\'t surface storage temps yet); each component\'s enable is wrapped in its own try; error context now includes the failing line. Probe survives subsystem failures instead of dying whole.',
      'BUG-FIX **Duplicate guide title** — every research article rendered its title twice (once from card metadata, once from the markdown\'s leading `# Heading`). Universal across all 16 guides. Fixed in `md.ts` — strips a leading H1 since the title is already in the card header.',
      'NEW **Auto-scroll-to-top on route change** — navigating from the bottom of `/grind` to `/hardware` no longer drops you halfway down the next page.',
      'NEW **Median-of-3 bench mode** on `/benchmark` — runs the bench 3x and uses the median per metric. ~90s but cuts run-to-run variance from ±2-4 composite points to ~±1. The right call when measuring per-tweak before/after deltas; explained inline why two consecutive single runs can disagree.',
      'CONTENT **NVIDIA Reflex guide** rewrite — added per-game settings table including Fortnite-specific "smaller delta but still positive" CPU-bound caveat; added the NVCP `Low Latency Mode` conflict warning (the kernel-of-truth behind "Reflex doesn\'t work in-game").',
      'CONTENT **Gaming mice guide** — polling rate section rewritten with explicit Fortnite-endgame warning (8K Hz polling can cost 5-15% on stacked endgames on anything below 7800X3D); LOD section expanded with per-vendor paths + 60-second test; **Finalmouse UltralightX Prophecy** added with the xpanel.finalmouse.com browser-config story; new **mouse skates** section (Tiger Arc / Corepad / Hyperglide / Hotline / X-Raypad with application tips); Boardzy added as primary skate-consensus source.',
      'NEW **/hardware → Mouse skates section** — Tiger Arc as default, Corepad for new mouse releases, Hyperglide for established models. Plus an application-tip "principle" entry (clean with iso, press 10s, wait 10min).',
      'NEW **Finalmouse UltralightX Prophecy** added to the mouse tier ladder — 33g, 8000Hz, browser-configured. The "no driver / daemon to babysit" answer.',
      'CONTENT **RAM advisor kit DB** expanded from 15 → 26 entries. Added Crucial Pro DDR5 6000 + Crucial JEDEC 5200/5600 + Ballistix MAX 4400, Patriot Viper Venom DDR5 6200 + Viper Steel DDR4 4400, TeamGroup T-Force Delta 7200, Klevv CRAS V (SK Hynix\'s own brand), ADATA XPG Lancer 6000, G.Skill Trident Z5 7200. The "we couldn\'t infer the IC" message should hit far fewer Crucial / Patriot / boutique kits now.',
      'CONTENT **/grind page rewrites** — Veno: full path (EU origin → got dropped → picked up Curve → won FNCS Major 1 NA Central with 727 pts → first ever to win EU+NA Grand Finals), Epic-Discord-toxicity-ban context, hall-effect keyboard insight. **Aussie Antics**: same depth as Peterbot now — verbatim Dignitas-interview quotes (4-year personal-training career, Halloween-2018 first-stream date, financial-runway philosophy, "more pros should look at traditional jobs" career realism). **Mongraal**: full IRL framing (Kyle Jackson, BBC News at 13, Team Secret signing), current 2025 Red Bull pickup + Jan-Feb 2026 MrSavage reunion arc — "comeback in progress" not "washed". **Bugha**: added FNCS Major 1 DQ insight (drop-calculator overlay, Epic\'s "mistake" reversal, lobby-already-full caveat). **Th0masHD**: bumped to top tier — best aimer in the game, scene rates him over Threats. **NEW EpikWhale entry**: 2019 World Cup 3rd Solo / $1.2M / NA West-on-LAN proof case + the Deyy "pissed on" historic clip + the NA-Central-with-Reet arc + recent FNCS Globals 2025 qualification with Paper + VicterV.',
      'REMOVED Faxuty, ArcoTV, The Fortnite Podcast — and the entire `podcast` GrindKind. Faxuty wasn\'t adding signal; the podcast section was filler the page didn\'t need. /grind chip filter drops the "podcasts" tab.',
    ],
  },
  {
    version: '0.1.59',
    date: '2026-05-10',
    highlights: [
      'NEW theme: **Element 115** (BO3 Zombies — proper). Cyan substance-glow primary (#3DDFE8), Pack-a-Punch chamber violet secondary (#9D4DFF), Buried candle-gold tertiary. Signature flourishes: faint runic etch on card hover, electric arc on input focus, candle-flicker on primary CTAs. Inspired by Buried + Origins + the wonder-weapon arsenal. Cinzel display serifs.',
      'Theme RENAME: `bo3` → `bumblebee`. The old "BO3" palette was Pack-a-Punch gold-on-black — that\'s bumblebee yellow, not the actual BO3 Zombies treatment. Same colorway, honest name. Existing users on `bo3` migrate transparently on next launch via profileStore rehydrate.',
      'Theme REWORK: Akatsuki dropped its Sharingan-gold accent (visually wrong for the org). Now black + crimson (#B71C1C) + Itachi-purple (#4A2C4A). Subtle red-cloud-blob background pattern. Crimson ring sweep on card hover (mimics the Akatsuki ring band). Sourced from naruto.fandom corroborated visual references.',
      'NEW: M logo on the left rail clicks → Maxxtopia Discord invite. Discordmaxxer item in the suite rail clicks → maxxtopia.com/discordmaxxer (already worked, just confirming the routing). Discordmaxxer logo updated to the current PNG mark.',
      'RENAMES: `Changelog` → `Updates` (everywhere — nav, page header, route /updates with /changelog kept as legacy alias). `Diff` → `Your Tune` in the nav. The page itself reworked with plain-language copy: "still in place" / "got reverted" / "partly in place" / "can\'t tell" instead of "on-target / drift / partial / unknown".',
      'CONTENT: /grind Peterbot section rewritten with current verified facts. **Duo: Pollo (2024 FNCS Global Champ partner, reunited 2026). Coach: Raz (Wave Esports).** Cut the previous bad take on the FNCS Pro-Am 2025 win with AussieAntics — Aussie\'s own quote was "I just focused on keeping pace", so the real story is Pete carrying, not "great pros need meta-readers". Updated rig to ZOWIE XL2566K (360 Hz + DyAC+) + GameSense Radar pad. Cut the made-up daily routine — no public sourced routine exists for Pete. Cited Codelife UPDATED Settings 2026 video.',
      'CONTENT: /hardware monitors gained DyAC+ explainer + ZOWIE XL2566K (Peterbot\'s) + XL2546K. Mousepads gutted to only what pros actually run: GameSense Radar (Peterbot), Artisan Hien Mid (Diggy\'s Fortnite pad), Wallhack Cloth (Diggy\'s daily). Dropped generic + Glorious Stealth from the recommendations.',
    ],
  },
  {
    version: '0.1.58',
    date: '2026-05-10',
    highlights: [
      'LIVE Discord — the Maxxtopia community hub is up at https://discord.gg/S78eecbWdx (67 members + growing). Pricing page CTA + Suggest-a-Tweak modal both now drop users into the real server. From there: open a TicketTool ticket in #open-ticket, Diggy DMs back the activation code after payment.',
      'New server structure: `— purchase —` category (#open-ticket + #vip-claim-help) + `— vip lounge —` category (#vip-chat + #early-access — locked to @VIP role only). VIPs get day-1 game configs + beta builds + the unfiltered version of #general.',
      'Welcome message in #welcome explains pricing per product honestly: optmaxxing one-shot lifetime ($115 launch / $180 reg) vs discordmaxxer continuous-service tier ladder ($4/$9/$17 monthly). No fake unified ladder.',
    ],
  },
  {
    version: '0.1.57',
    date: '2026-05-10',
    highlights: [
      'PRICING RESTRUCTURE — VIP is now a one-time lifetime unlock, not a $8/mo subscription. Optimization tools are structurally one-shot value (apply tweaks → done) so subscription was the wrong shape. **$180 lifetime · summer maxximization sale $115 through 2026-05-31** (Element 115, BO3 Zombies inspired — the substance that turns dead PCs into living ones). New atomic-symbol visual treatment on the VIP card with cyan glow, "Mc · 115 · Moscovium" badge.',
      'NEW launch buyer flow — Discord ticket → DM Diggy → pay via PayPal / BTC / Venmo / Cash App / whatever works → receive activation code. Card-checkout (Stripe) deferred to v0.1.58+ — TicketTool bot in Discord handles the launch round of buyers (personal touch, qualifies the buyer, lets you take any payment).',
      'Pricing copy refresh — hero now anchors against gear spend ("you paid $150 for a Superlight to gain 0.5ms — pay $115 once for 12-22ms"). VIP_FEATURES list rewritten to match actual current capability (was promising NVPI integration which is still deferred). Comparison row gains Pricing model / Per-tweak measurement / /diff audit / Day-1 game configs cells.',
    ],
  },
  {
    version: '0.1.56',
    date: '2026-05-10',
    highlights: [
      'NEW /tune page — the lazy-user one-click conversion path. Three steps, ~90 seconds: (1) Scan rig + initial Asta Bench (2) Apply every safe tweak that matches your rig under one UAC — not just top 6 like Dashboard recommendations (3) Auto re-bench + show before/after composite delta. After the apply: shows you exactly how many VIP-only tweaks you missed and the projected composite gain you left on the table. Linked from Dashboard hero CTA + nav. Game-agnostic — works for any title since the ~70 rig + Windows tweaks compound regardless.',
      'POLISH Dashboard hero now leads with "Tune now (90s)" instead of "Browse tweaks". Lazy-user path is the default path; power users still get every other route from the nav.',
      'Skipped from auto-apply: risk-4 tweaks (CPU mitigations off etc.) + tournament-breaking + high-anticheat-risk. You opt into those individually from /tweaks. Every applied tweak is one-click reversible from Settings → Restore Point.',
      'VIP-gap projection uses your previously-measured per-tweak deltas (from the per-tweak measure button on /tweaks) where available, falls back to a conservative heuristic (+0.4 low-risk / +0.9 mid-risk per tweak). Outliers capped at ±5 composite per tweak so a single noisy measurement can\'t skew the projection.',
    ],
  },
  {
    version: '0.1.55',
    date: '2026-05-10',
    highlights: [
      'NEW Asta Bench history graph — pure-SVG line chart of composite over time on /benchmark. Linear-regression trend overlay tells you "rising / flat / falling" without us editorializing. Hover any point for label + timestamp.',
      'NEW "I\'m Asta-modded" share card on /asta — Canvas-generated 1080×1080 PNG with your latest composite + before/after delta + Asta visual treatment (void bg, hairline cracks, crimson border pulse). Right-click → save → post to X/Discord. All local — nothing leaves the machine.',
      'NEW Valorant in-game pro-settings guide — Vanguard fights config-dir writes so we ship no Valorant FileWrite tweak. This is the next-best path: TenZ/yay/Demon1/aspas consensus stack (HRTF on, Improve Clarity off, frame-rate-limit at 2× refresh, full graphics low).',
      'NEW /grind entries — Khanada (controller pro), Th0masHD (EU pro/coach), Faxuty (mechanical specialist), ArcoTV podcast. Catalog grew from 8 to 12 cited sources.',
      'NEW telemetry events wired — preset.applied (with anyVip flag) + bench.composite (with labelKind for before/after/run bucketing). Closes the data-loop gap from v0.1.54.',
      'GLAMOUR Sonic + BO3 flourishes shipped — Sonic gets a 520ms speed-line sweep across .surface-card on first hover (kinetic signature). BO3 gets corner-bracket HUD frames via a new <HudFrame> wrapper, applied to RAM Advisor / DPC / VBS / Microcode cards on /diagnostics. No-op outside the matching profile.',
      'POLISH RamAdvisor unknown-IC card now ships a "hop, not a dead-end" callout with Thaiphoon Burner + community part-DB links. Was just an amber badge.',
      'DOC CLAUDE.md refreshed — replaced the v0.1.35-stale phase log with a never-rots stack/layout/release-flow doc. Per-release "what shipped" lives in changelog.ts; per-release intent lives in commit messages.',
    ],
  },
  {
    version: '0.1.54',
    date: '2026-05-09',
    highlights: [
      'NEW /hardware page — peripheral advisory with GOAT/pro/budget tier ladders for Mouse, Keyboard, Monitor, Mousepad, Ergonomics. Cited from /grind rig snapshots + ProSettings.net consensus. Aussie Antics PT background drives the ergonomics section. Append a HardwareItem to `src/lib/hardware.ts` to grow.',
      'NEW anonymous opt-in telemetry — Settings page toggle (OFF by default). Sends an anonymous device hash + which tweaks/presets you applied + your Asta Bench composite to a Cloudflare worker. Auto-fires on app.launch + tweak.applied. Different HWID salt from VIP so the two worker KVs can\'t be cross-correlated. Worker code at `telemetry-worker/` — NOT yet deployed (deploy = `wrangler kv namespace create telemetry-events` + paste id + `wrangler deploy`).',
      'NEW crash reporting — Rust panic hook + React error boundary write to `%LOCALAPPDATA%\\optmaxxing\\crashes\\<ts>__<kind>.log`. Diagnostics page now has a "Last crash" card with copy-to-clipboard for Discord support. Zero network egress — all local files.',
      'FIX (P1) per-tweak measure race — Tweaks page now disables ALL Apply/Revert/Measure buttons across the page when ANY operation is in flight. Was per-row; concurrent Apply on a different row could pollute the in-progress before/after measurement.',
      'GLAMOUR Val theme — scanline overlay (1px every 2px, dense but very low alpha) fades in on .surface-card hover. Valorant HUD signature flourish. Respects prefers-reduced-motion.',
      'GLAMOUR DMC theme — bone-gold text-shimmer keyframe across the serif h1/h2 display headings (4s ambient loop). Respects prefers-reduced-motion.',
    ],
  },
  {
    version: '0.1.53',
    date: '2026-05-09',
    highlights: [
      'NEW Fortnite GameUserSettings.ini tweak — pairs with the existing Engine.ini. Locks FrameRateLimit=240, VSync off, motion blur off, grass off, HDR output off, fullscreen-windowed mode (Fortnite\'s lowest-input-lag option since exclusive-fullscreen was removed in Ch5). VIP-gated, snapshot-backed revert. Catalog now ~96 tweaks.',
      'NEW /guides article: Fortnite — in-game pro settings. Cited consensus stack for everything that lives inside Fortnite\'s own Settings menu (the things Engine.ini + GameUserSettings.ini can\'t touch — Reflex+Boost, Performance render mode, View Distance Far not Epic, audio + replay settings). Sourced from Peterbot/Clix/Bugha/Mongraal public configs.',
      'NEW /grind page operationalized — per-pro daily routine breakdowns now expandable on Peterbot, Clix, Bugha, Aussie Antics. Morning/Afternoon/Evening/Recovery blocks instead of just philosophy quotes. Real templates kids can copy.',
      'GLAMOUR pass — every .surface-card now ships a layered diagonal accent gradient + inset hairline glow. Propagates depth across ~40 surfaces in one shot. Ring gauges get double drop-shadow for premium glow. Primary CTAs (.btn-chrome.bg-accent) get a per-theme accent → accent-dark gradient layered on top of the chrome trim.',
      'FIX UpdateBanner re-nag — "later" now persists per-version in localStorage so a dismissed v0.1.53 banner doesn\'t reappear on every app launch. New release wipes the suppression so genuine upgrades still surface.',
      'FIX Asta easter egg — 5-tap window on Pricing $8 was accumulating clicks across multi-minute gaps and triggering the redemption panel unintentionally. Now resets cleanly when the 3-second window expires.',
      'FIX /diff Copy-as-text — guard against copying "0 tweaks applied" snapshot when the audit returns an empty active set.',
    ],
  },
  {
    version: '0.1.52',
    date: '2026-05-09',
    highlights: [
      'NEW /diff page — every applied tweak in one consolidated audit table. Shows on-target / drift / partial / unknown verdict per row, expandable per-action detail, summary strip across the top, "copy as text" so users can DM their tune. Catches drift from Windows Update / other tuners / accidental BIOS resets.',
      'NEW third-party benchmark score logger on /benchmark — Cinebench R23 / 2024 multi+single, 3DMark Time Spy / Time Spy Extreme / Steel Nomad / Speed Way / Fire Strike, plus CS2-fps-bench and Fortnite-replay-fps. Per-benchmark history, latest delta vs previous, point/fps unit-aware. Persisted to localStorage.',
      'NEW CS2 competitive autoexec.cfg FileWrite — converged-pro baseline (raw input + 128-tick netcode + interp 0/ratio 1 + lag-comp + mat_queue_mode 2 + audio mix-ahead 25ms). Lives in cfg/autoexec.cfg, snapshot-backed revert.',
      'NEW Apex Legends competitive videoconfig.txt FileWrite — strips gibs / ragdoll collision / particles / film grain / dynamic super-sampling / cascade shadows. Read-only enforcement step required after apply (PowerShell `attrib +R` snippet documented in the tweak description) since Apex rewrites videoconfig at launch.',
      'Skipped Valorant FileWrite — Vanguard kernel AC fights config-dir modifications. Will ship a /guides article instead next batch.',
    ],
  },
  {
    version: '0.1.51',
    date: '2026-05-09',
    highlights: [
      'CI fix: Tauri 2 needs `createUpdaterArtifacts: true` in bundle config to actually emit latest.json. v0.1.50 shipped without it (silent no-op). v0.1.51 emits the signed manifest. v0.1.49+ installs in the wild now get the in-app update banner pointing at this build.',
    ],
  },
  {
    version: '0.1.50',
    date: '2026-05-09',
    highlights: [
      'NEW RAM Tightening Advisor on /diagnostics — reads Win32_PhysicalMemory + identifies the IC die type from the part number (Samsung B-die / Hynix M-die / Hynix A-die / Hynix CJR/DJR / Micron Rev.E / Hynix DDR5 etc). Per-stick: vendor / part / capacity / speed / voltage + tuning character paragraph + links to Thaiphoon Burner / DRAM Calculator / TestMem5 / Buildzoid. Closest thing to a free 5-8% FPS — read-only, articleware. We never auto-flash BIOS.',
      'NEW /guides article: "The latency budget — every layer, cited" — full click-to-pixel breakdown (input + Windows/driver + game/render/queue + GPU + display + network), per-layer tunable vs hardware-fixed, with Battle(non)sense + NVIDIA Reflex whitepaper + Blur Busters citations. Net deltas table: 76 ms stock → 31.5 ms tuned on a comparable rig.',
      'NEW /guides article: "The grind layer — sleep, sessions, warmups, body" — Stanford sleep + athletic performance data (9% accuracy improvement from 7→10 hours), Aussie Antics personal-training-background take on body grind, 90/10 session cadence research from Anders Ericsson, fixed warmup routine framework, VOD review prompts, what to copy from each pro on /grind.',
      'FIRST signed release. CI now has TAURI_SIGNING_PRIVATE_KEY + TAURI_SIGNING_PRIVATE_KEY_PASSWORD secrets — release.yml emits a signed latest.json alongside the .exe. v0.1.49 installs in the wild get the in-app update banner the moment this release publishes. End-to-end auto-update pipeline closed.',
    ],
  },
  {
    version: '0.1.49',
    date: '2026-05-09',
    highlights: [
      'NEW per-tweak impact measurement — small "📏 measure" button on every Tweak row. Click it: runs Asta Bench (~30s) → applies the tweak → settles 4s → reruns Asta Bench. Persists the measured composite delta keyed by tweakId in localStorage. Catalog row shows "measured +0.8 score" inline once you have data — empirical, not vibes. Free-tier feature.',
      'NEW Pre-Tournament Audit on /asta — one button below Activate, ~40s, six checks: Latency Health Score ≥ 75, ping p50 < 30 ms / jitter < 8 ms, DPC < 2%, Game DVR off, no recording/overlay apps running (OBS / Streamlabs / GeForce Experience / ShadowPlay), Windows Update + Search Indexer services stopped. Pass / warn / fail per row + an overall verdict ribbon.',
      'NEW Asta Bench HUD on Dashboard — small glanceable card with your latest composite + 10-snapshot sparkline (rising = green, falling = red). Click → /benchmark.',
      'NEW auto-update via Tauri updater plugin — every launch checks https://github.com/MaxxTopia/optimizationmaxxing/releases/latest/download/latest.json. New version available? Banner appears at top of app — one click downloads + verifies signature against bundled minisign public key + relaunches into the new build. v0.1.49 ships the plumbing; v0.1.50+ users get the prompt.',
      'CI release.yml wired with TAURI_SIGNING_PRIVATE_KEY + TAURI_SIGNING_PRIVATE_KEY_PASSWORD env vars + updaterJsonPreferNsis=true so future tag pushes auto-emit a signed latest.json.',
      'Pipeline ops fix — patched the 6 sibling sync-*-release.yml workflows (aimmaxxer / clipmaxxer / discordmaxxer / dropmaxxer / editmaxxing / viewmaxxing) with the same actions:write + gh workflow run deploy.yml step we shipped on the optimizationmaxxing sync. Future product releases auto-cascade through the deploy chain too.',
      'Refactor: Asta Bench logic moved to src/lib/astaBench.ts so /benchmark page + per-tweak measure flow share the same scoring + runner. No double-implementations.',
      'New Tauri command: audit_state() — sysinfo process scan + winreg Game DVR probe + service-state queries.',
    ],
  },
  {
    version: '0.1.48',
    date: '2026-05-09',
    highlights: [
      'NEW Asta Mode — VIP-only ceiling preset bundling every aggressive lever this app reaches. Black Clover anti-magic visual treatment: void background, white SVG hairline cracks with flicker, crimson border pulse on hover, 5-leaf grimoire glyph, Pirata One serif, rotating manifesto quote band. Dashboard card + dedicated /asta page.',
      'NEW Fortnite competitive Engine.ini FileWrite tweak — writes the Bugha/Mongraal/Clix-converged baseline (PostProcess/Shadow/ViewDistance/Effects/Foliage all to 0, motion blur off, anti-aliasing off, mesh LOD bias maxed, logs muted) to %LOCALAPPDATA%\\FortniteGame\\Saved\\Config\\WindowsClient\\Engine.ini. Snapshot-backed revert.',
      'NEW Asta Bench at /benchmark — 4-metric Latency Health Score 0-100. CPU sha256 single-thread (game-thread tail proxy), DPC % over 5s, ping jitter 30 samples to 1.1.1.1, frame-pacing stddev via 10s rAF (same DWM compositor Fortnite renders through). Persists snapshots to localStorage; before/after diff card auto-pairs the latest "before" + "after" snapshots and shows green/red deltas.',
      'NEW /grind page — curated knowledge channel with cited insights from Peterbot (THE GOAT), Veno, Aussie Antics, Mongraal, Clix, Reet, Bugha. Per-creator: credential + voice + rig snapshot + 3-6 insights with sources (ProSettings, Esports.gg, Liquipedia, Dignitas). Built to grow — adding a new pro is one entry append in src/lib/grind.ts.',
      'Asta Mode preset references ~30 existing aggressive tweaks + the new Engine.ini FileWrite. Apply via /asta page Activate button, one UAC prompt, snapshot-backed revert via Settings → Restore Point.',
      'Topnav order: Dashboard · Tweaks · Presets · Guides · Grind · Asta · Toolkit · Diagnostics · Session · Profile · Pricing · Settings · Changelog',
      'Backend: 2 new Tauri commands (bench_cpu, bench_ping). Cargo deps unchanged (sha2 already in tree from VIP module).',
    ],
  },
  {
    version: '0.1.47',
    date: '2026-05-08',
    highlights: [
      'NEW Cloudflare Worker first-claim ledger — drop a code in DM, friend pastes, code locks to their rig on first activation. No back-and-forth needed.',
      'Worker code at vip-worker/ with 5-step deploy in vip-worker/README.md. Free tier (100k req/day, 100k KV reads/day, 1k KV writes/day) — never going to hit it.',
      'New mint script: scripts/mint-unbound-codes.py — generates fresh random Crockford-base32 codes (16 chars = 80 bits, unguessable) ready to paste in DMs. Run with N to mint a batch: `python scripts/mint-unbound-codes.py 10`.',
      'VipRedemptionPanel now tries online claim first (the new flow), falls back to local HWID-bound HMAC verify if the worker is unreachable — so the older offline scripts/mint-vip-code.py <hwid> path still works as a fallback for high-trust gifts.',
      'New "already claimed by another rig" amber message replaces the generic fail when the worker returns 409 — tells the friend the code is dead and to ask for a fresh one.',
      'Worker URL configurable via OPTMAXXING_VIP_WORKER_URL env var at build time; default points at the workers.dev subdomain shape.',
    ],
  },
  {
    version: '0.1.46',
    date: '2026-05-08',
    highlights: [
      'NEW HWID-bound VIP redemption codes — no backend, no Stripe, no recurring billing. Friend installs the app, copies their HWID fingerprint from a hidden panel, DMs it to me, I run scripts/mint-vip-code.py <hwid> + DM the code back. Friend pastes + activates. Code only works on that exact rig.',
      'Easter-egg trigger: tap the VIP "$8" price on the Pricing page 5 times within 3 seconds → reveals the HWID display + redemption input. Apple-developer-mode pattern; nothing in the UI hints the price is interactive.',
      'Hypixel gold redemption panel — confetti burst on success, shake animation on miss, copyable fingerprint, MAXX-XXXX-XXXX-XXXX-XXXX paste-friendly format with whitespace + lowercase tolerated.',
      'Crockford-style base32 (no I/L/O/U) so codes survive being typed by hand from a phone.',
      'Rust + Python parity-locked: both implementations share the VIP_SECRET constant + algorithm, with a Rust unit test asserting the canonical "32 zeros" HWID produces the exact code Python emits. Drift between the two now fails CI.',
      'useVipStore extended with applyRedemption(code, hwid) — persists code + bound HWID alongside tier. Survives reboots; doesn\'t survive moving to a new rig (HWID changes).',
      '+8 cargo tests for vip module (mint determinism, per-HWID divergence, verify accept/reject, prefix/whitespace tolerance, alphabet sanity, Python parity vector). 32/32 unit tests pass.',
    ],
  },
  {
    version: '0.1.45',
    date: '2026-05-08',
    highlights: [
      'LHM dependency set complete — 27 DLLs bundled (LibreHardwareMonitorLib + HidSharp + RAMSPDToolkit-NDD + DiskInfoToolkit + 23 .NET runtime support libs). Validated end-to-end on a Ryzen 7 2700 + RTX 2070 + WD_BLACK SN770 + Corsair DDR4-3600 + ASRock X570 Steel Legend.',
      'Bundle config switched to glob (resources/lhm/*.dll) so future LHM upgrades do not require itemizing each transitive dep.',
      'Probe-validated sensor coverage: AMD Tctl/Tdie + per-core clocks + per-core load + per-core VID, NVIDIA GPU core temp + hot spot + fan + power + memory clock, NVMe SMART, motherboard zones via Nuvoton SuperIO.',
    ],
  },
  {
    version: '0.1.44',
    date: '2026-05-08',
    highlights: [
      'NEW LibreHardwareMonitor-backed Live Thermals. Real CPU package + per-core temps, GPU core/memory clocks + power + fan, NVMe SMART, motherboard zones, fan RPMs, voltage rails. v0.9.6 LHM bundled (~1.5 MB).',
      'Two-tier probe: unelevated user-mode probe runs every 2.5 s automatically (gets ACPI + GPU + SMART). "Enable full sensor access (UAC)" button fires the elevated probe — loads WinRing0 kernel driver, unlocks CPU package + voltage rails. Persists preference for next launch.',
      'Throttle banner fires automatically when any CPU sensor ≥ 95 °C, package ≥ 90 °C, or any GPU temp ≥ 88 °C.',
      'Fallback path: if LHM bundle fails (AV blocking the driver), card auto-falls-back to the v0.1.43 WMI + nvidia-smi probe so users still get something useful.',
      'NEW troubleshooting guide: "AV blocking WinRing0 / LHM" with Add-MpPreference snippet for Defender + notes for Bitdefender/Kaspersky/ESET/CrowdStrike. Linked from the Live Thermals error fallback.',
      'Per-component tile layout — CPU tile leads with package KPI + load + power + per-core breakdown details; each GPU gets its own tile with core+mem clocks; storage tile shows SMART temp + wear; motherboard sensors top-8.',
    ],
  },
  {
    version: '0.1.43',
    date: '2026-05-08',
    highlights: [
      'NEW Live Thermals + Throttle Watch on /toolkit — refreshes every 2 s. ACPI motherboard zones, NVIDIA GPU temp / clock / power / fan / utilization (via nvidia-smi), CPU live MHz vs base ratio. Banners red when thermal throttle is suspected.',
      'CPU throttle detection: surfaces "% of max frequency" from Win32_PerfFormattedData_Counters_ProcessorInformation; flags red if any thermal zone ≥ 80 °C while CPU runs < 90% of max.',
      'GPU throttle reasons decoded: nvidia-smi clocks_throttle_reasons.active hex bitmask → human-readable labels (sw power cap, hw thermal slowdown, hw power brake, etc.).',
      'NEW 8311 X-ONU-SFPP stick monitor on /toolkit — fetches the 8311 community firmware metrics endpoint (default https://192.168.11.1/cgi-bin/luci/8311/metrics), shows live temperature / TX/RX optical power / voltage / bias / PON state. Amber pill at 55 °C, red at 60 °C (pon.wiki recommends active cooling above 60 °C).',
      'Self-signed TLS tolerated for the LuCI cert. Auto-refresh toggle. Persists URL to localStorage. Raw JSON viewable for firmware-version debugging.',
      'Old "Live thermal probes" 28 °C ACPI-only card replaced. Disk Cleanup card unwrapped from the broken 2-column grid that left an empty right pane after extraction.',
      '+4 cargo tests for the 8311 metrics parser (typical shape, nested fields, string-with-units, parse-error fallback). 24/24 unit tests pass.',
    ],
  },
  {
    version: '0.1.42',
    date: '2026-05-08',
    highlights: [
      'NEW Dashboard Quick Start — first-run 3-card walkthrough (pick your game / apply preset / tune later) with deep-link to /tweaks?game=<id>. Dismissible; reappears on major upgrades.',
      'NEW /guides page — curated articles moved out of /toolkit footer into a dedicated route with per-game chip filter, search, and an "include advanced (SCEWIN / overclocks)" toggle. Old Toolkit section now redirects.',
      'Per-game callouts on every guide — pick Fortnite + see "For Fortnite:" line at the top of every relevant article. Article cards expose all callouts inline when expanded.',
      'NEW guide: lightweight Windows distros — Atlas / X-Lite / Tiny11 / Ghost Spectre / ReviOS compared side-by-side. Anticheat compat, update story, idle RAM, recommended-for. Includes our verdict on whether to build a maxxer-OS (not yet).',
      'NEW guide: BIOS + tweaks vs tournament rules — Fortnite (FNCS/EAC), Valorant (Vanguard/VCT), CS2 (VAC), Warzone (Ricochet+BattlEye). Maps every catalog tweak to per-anticheat verdicts.',
      'NEW guide: SCEWIN advanced track — read-only BIOS export workflow for diagnostics + before-you-flash backup. Article-only; we never auto-edit BIOS at runtime.',
      'gaming-mice guide rewritten with current ProSettings.net data (650+ Valorant pros, 328 Fortnite pros, May 2026): the "every pro uses 1600 DPI" myth is out — 800 is dominant in Val + Fortnite, 400 in CS2. Cited per-genre.',
      'Latency probe heads-up — first-run banner explains the brief flash so it doesn\'t feel broken. Persists optmaxxing-latency-probe-seen.',
      'Motion tokens (--motion-snap / --motion-arc / --motion-glow) — applied uniformly across all 5 themes. Per-theme tone via glow speed: Sonic kinetic, BO3 Zombies + DMC heavy, Val + Akatsuki neutral.',
      'surface-card hover-lift (1 px) for TikTok-pace responsiveness. Reduced-motion preference respected.',
    ],
  },
  {
    version: '0.1.41',
    date: '2026-05-08',
    highlights: [
      'NEW Akatsuki theme — cloud-red on void with Sharingan-gold accents and Cinzel display serifs. Brings the theme count to 5 (val · sonic · dmc · bo3 · akatsuki).',
      'BO3 theme reworked into BO3 Zombies — Pack-a-Punch gold + blood maroon + Origins-crypt black + parchment text + Pirata One serif headings + faint blood-drip text-shadow. The orange/olive corporate read is gone.',
      'Val theme polished — desaturated red, deeper base, sharper borders, tactical heading weight. No more candy-red plastic.',
      'NEW maxxer suite sidebar — ported wholesale from maxxtopia.com so the desktop app reads as the same product family. Indigo "fidget orb" close button with breathing pulse + smoke trail, click-zap electricity ripple in each product\'s accent, "Banish/Unleash the Menu" DMC tooltip, Sharingan-gold M brand mark.',
      '7 maxxer products in the rail (optimizationmaxxing, discordmaxxer, clipmaxxer, dropmaxxer, aimmaxxer, viewmaxxing, editmaxxing) with per-product accents + lock overlays for "coming soon".',
      'Heading fonts now load Pirata One + Cinzel + Cormorant Garamond + Metal Mania from Google Fonts on first launch (graceful fallback to system serifs offline).',
    ],
  },
  {
    version: '0.1.40',
    date: '2026-05-08',
    highlights: [
      'NEW per-game tweak filter — Tweaks page gains a Game chip row (Fortnite / Valorant / CS2 / Apex / Warzone / osu / OW2). Universal tweaks always show; tagged ones show only when their game is picked.',
      'NEW Tournament-eligibility flagging — high-risk tweaks (HVCI off, Hyper-V off, Spectre mitigations off) carry a per-game ⚠ pill and a "hide tournament-breaking" filter when a game is selected.',
      'NEW Risk legend — click the ? next to the Risk filter to see what 1/2/3/4 actually mean (Safe / Standard / Expert / Extreme). Hover any chip for the same.',
      'VIP badges restyled with a Hypixel-gold gradient + crown so locked tweaks read as locked at a glance instead of as another accent chip.',
      'NEW in-app Bufferbloat probe — runs a 30 MB Cloudflare /__down stream while pinging 1.1.1.1, scores idle vs loaded p50 with an A–F grade. External Waveform / DSLReports / fast.com / Ookla links demoted to a "deeper test" footer.',
      'No more flashing cmd windows — every PowerShell / ping / bcdedit probe now runs with CREATE_NO_WINDOW. Latency Probe + Bufferbloat + PCIe link + DPC + Session suspend are all silent.',
      'Centralized Game registry at src/lib/games.ts — single source of truth for tweak filtering, Session profiles, and (Phase 4) per-guide callouts.',
    ],
  },
  {
    version: '0.1.39',
    date: '2026-05-08',
    highlights: [
      'NEW Game Session mode — pick the game you\'re playing today (Fortnite / Valorant / CS2 / osu / Custom), see every competing launcher / voice / music / overlay running, hit Start to suspend them all',
      'Suspend-Process freezes them in RAM — no CPU, no IO, instant resume on End Session',
      'Per-game keep-list: Epic stays alive when you pick Fortnite, Vanguard + Riot stack stay alive for Valorant, Steam stays alive for CS2',
      'Force-resume-by-name recovery for stuck-suspended processes after a crash',
    ],
  },
  {
    version: '0.1.38',
    date: '2026-05-08',
    highlights: [
      '3 new fiber-aware NIC offload tweaks: net.nic.rsc.disable, net.nic.checksum-offload.disable, net.nic.lso.disable — let the CPU handle packet work for tighter frametimes',
      'Renamed Ultimate Performance plan → "DT Tournament" with explicit thermal-limits-still-active note',
      'New Recommended Gear research article — mouse / keyboard / pad / monitor / network framework, no affiliate links',
    ],
  },
  {
    version: '0.1.37',
    date: '2026-05-07',
    highlights: [
      'Launch splash screen — transparent 360×360 squircle with the lightning bolt + neon-blue ripple sweeping vertically through the bolt path',
      'Closes when the React app finishes mounting (1.2s minimum so the animation gets one full sweep) — 5s self-close fallback if the main window never wakes',
      'Tauri 2 splash via separate window definition; main window starts hidden, Rust close_splashscreen command swaps them',
    ],
  },
  {
    version: '0.1.36',
    date: '2026-05-07',
    highlights: [
      'New brand mark — pink-magenta squircle with white lightning bolt (the lightning-bolt-in-square design from discordmaxxer\'s earlier era)',
      'Replaced ICO + 3 PNG sizes (32×32, 128×128, 256×256) + SVG, fixed broken /vite.svg favicon reference in index.html',
    ],
  },
  {
    version: '0.1.35',
    date: '2026-05-07',
    highlights: [
      'Research-driven mega-batch — 4 parallel research agents, every claim cited, then ship',
      'NEW Diagnostics cards: Intel 13/14gen Microcode (Vmin Shift Instability detector vs 0x12B floor) + VBS Status (BCD + HVCI + Win32_DeviceGuard tri-probe)',
      'Live DPC sparkline with 1-Hz toggle — 60s rolling window with 5% threshold reference line',
      'Catalog 68 → 87: HID priority (mouse + keyboard ThreadPriority=31 + queue size 20), VBS HVCI registry disable, IFEO CpuPriorityClass=High for Fortnite/Valorant/CS2, 9 service kills (WerSvc, MapsBroker, RetailDemo, Fax, WMP-Net, Geolocation, Smart Card x3, Biometric, TabletInput), 13 scheduled-task batch disable (Compat Appraiser, CEIP, Maps, Feedback, WER), MSI mode PS enumeration on Display+Net+AudioEndpoint with hard exclude of storage/xHCI',
      'NEW Clean State Gaming community preset (🛡) bundling 19 of the above',
      'Honest non-shippers: IFEO Affinity is folklore (does not work). Realtime priority causes input starvation. CRU is too risky for one-click. NVPI/DDU need Phase 4d-v2 ExternalToolInvoke.',
    ],
  },
  {
    version: '0.1.34',
    date: '2026-05-07',
    highlights: [
      'New Latency Probe on Toolkit — 6 curated gaming-relevant ping targets (Cloudflare, Google, Epic, Riot NA/EUW/KR) + custom-host slot for game-server IP from netstat',
      'New PCIe Link card on Diagnostics — flags GPU running below max width (x8 instead of x16) or below max gen, with ASPM caveat copy',
      'New AMD UCLK warning on Diagnostics — heuristic flag if Ryzen 7000 RAM > 6400 MT/s likely fell into 1:2 mode (or Ryzen 5000 > 3800 MT/s lost FCLK 1:1)',
      'New Discord low-FPS research article — 4 manual toggles + why we can\'t automate it (Discord uses binary leveldb prefs)',
    ],
  },
  {
    version: '0.1.33',
    date: '2026-05-07',
    highlights: [
      'Audit-deferral correctness pass — every UX/edge-case flag from the 3-agent audit shipped',
      'DPC measurement: migrated to ProcessorInformation class (per-NUMA / per-CCD breakdown on hybrid Intel + dual-CCD Ryzen)',
      'DPC card: warming-up badge for first read; auto-retry after 1.5s if all-zero',
      'NIC tweaks: replaced -ErrorAction SilentlyContinue with probe-and-log to %LOCALAPPDATA%\\optmaxxing\\nic-tweak.log so users can verify which adapters actually accepted each property',
      'New formFactor target: laptop-hostile tweaks (core-parking, PCIe ASPM, USB-3 link-power, dynamic-tick, power-throttling) now gated to desktop only',
      'FileWrite revert: pins apply-time resolved path in pre-state so env-var changes between apply/revert can\'t restore to the wrong file',
      'registry::delete_value now propagates permission errors instead of swallowing all',
      'is_user_profile_path no longer trusts %TEMP%/%TMP% (could redirect outside profile)',
      'Preview drawer: surfaces "one-way" actions (subkey-delete + PowershellScript with revert: null) prominently before apply',
    ],
  },
  {
    version: '0.1.32',
    date: '2026-05-07',
    highlights: [
      'AUDIT-DRIVEN CORRECTNESS PASS — 3 research agents validated every tweak against Microsoft Learn + community sources',
      'Removed 10 placebos / folklore entries (catalog 78 → 68 honest tweaks): bcd.useplatformtick, bcd.clockres.0.5ms, MaxFreeTcbs, GlobalMaxTcpWindowSize, Tcp1323Opts, DefaultTTL, MaxUserPort, TcpTimedWaitDelay, IRPStackSize, bcd.hpet-device duplicate',
      'Fixed 2 actively wrong tweaks: ui.zone-warning.disable (value 1 → 2 to actually strip MOTW), ui.mouse.disable-shadow (now writes Desktop\\MouseShadow not Cursors\\Scheme Source)',
      'Fixed 2 revert bugs: power.pcie.link-state.off restores AC=1 (was 2), net.nic.flow-control falls back through 4 vendor-spelled values',
      'Rebuilt Network Low-Latency preset around tweaks that actually move the needle on Win10/11 (NIC interrupt mod, RSS, hosts blocks)',
      'Trimmed Frame Pacing to 6 verified-real BCD tweaks; Tournament FPS to 6 entries (dropped placebo + duplicate)',
      'Updated rationales for priority-separation, cpu-mitigations (only Spectre v2 + Meltdown not MDS), windows-spotlight (CloudContent not lock-screen), telemetry (Enterprise-only caveat)',
    ],
  },
  {
    version: '0.1.31',
    date: '2026-05-07',
    highlights: [
      'New FileWrite engine action variant — catalog can now ship file-level tweaks (Engine.ini, GameUserSettings.ini, .nip profiles, .cfg overrides)',
      'Snapshot-backed revert: prior file bytes captured base64 (≤1 MB), restored byte-perfectly',
      'Path env-var expansion: %USERPROFILE% / %APPDATA% / %WINDIR% / etc.',
      'User-profile paths apply unelevated; system paths route through the existing one-UAC batch',
      'Phase 4d-v2 milestone — ExternalToolInvoke (NVIDIA Profile Inspector + ParkControl + msi-util) deferred until we have signed bundled binaries',
    ],
  },
  {
    version: '0.1.30',
    date: '2026-05-07',
    highlights: [
      'New DPC + Interrupt Time card on Diagnostics — measurable before/after for every preset',
      'Save baseline → apply preset → Refresh → see exactly which way the needle moved',
      'Healthy-rig threshold lines (green ≤2% · neutral 2-5% · red >5%) so you can tell at a glance whether a driver is misbehaving',
      'This is the differentiator: every other tweak utility applies and asks you to trust them. We measure.',
    ],
  },
  {
    version: '0.1.29',
    date: '2026-05-07',
    highlights: [
      'Catalog 70 → 78: 8 deepest-impact latency tweaks pros run that no other tuner ships',
      'NIC: Interrupt Moderation off · Flow Control off · RSS forced on (PowerShell, all up-physical adapters)',
      'CPU: Core Parking disabled (powercfg, no third-party tool) · TCP window cap',
      'Power: PCIe ASPM off · USB-3 Link Power Mgmt off (reveal + disable in one)',
      'Timer: device-side HPET disable (Service Start=4) — pairs with bcd.useplatformclock',
      'New "Tournament FPS" community preset bundles all 8 — one UAC, fully reversible',
    ],
  },
  {
    version: '0.1.28',
    date: '2026-05-07',
    highlights: [
      'New "Scan rig state" on Tweaks page — compares every tweak\'s current registry/BCD value against its target so you can see which are already set vs which would change',
      'Per-row state badge: ✓ already set · ◐ partial match · ✗ would change · ? unknown (PowerShell)',
      'Expanded TweakRow now shows a per-action breakdown: "Currently 1, target 0", etc.',
      'New "On-rig" filter — show only tweaks that already match, would change, or are partial',
    ],
  },
  {
    version: '0.1.27',
    date: '2026-05-07',
    highlights: [
      'New Diagnostics page — one-shot rollup of rig + live CPU/RAM + temps + disk-free with Copy-snapshot for Discord support posts',
      'Landing site refreshed to v0.1.27 stats (70 tweaks, 10 presets)',
    ],
  },
  {
    version: '0.1.26',
    date: '2026-05-07',
    highlights: [
      'Changelog page now reachable from the in-app nav (was direct-URL-only)',
      'Rig targeting expanded to 26/70 tweaks — OS-build floors on FSE, Power Throttling, Ultimate Performance, Bing-in-Start, Modern Standby, Storage Sense, Cloud Clipboard',
    ],
  },
  {
    version: '0.1.25',
    date: '2026-05-07',
    highlights: [
      'Catalog now 70 tweaks: + Wake Timers, News-and-Interests, Storage Sense, Snap Layouts hover, Cloud Clipboard',
      '/changelog page route — full version history',
      'Dashboard score-blocker hint: "Lift the score: try <preset>"',
      'Compare matrix gains free-text search; Preview KindChip glyphs (🔑 🗝 ⚙ ⌨); Community preset glyphs (🔋 🎨 🎥 🏆 🌙)',
      'web-landing/ sitemap.xml + robots.txt for indexability',
    ],
  },
  {
    version: '0.1.23',
    date: '2026-05-07',
    highlights: [
      'New Calm Mode community preset — bundles every Win10/11 annoyance kill (Recall, Spotlight, Sticky Keys, transparency, autostart pile-up)',
      'OG image scaffolding (web-landing/og.html → og.png) for social sharing',
    ],
  },
  {
    version: '0.1.21',
    date: '2026-05-07',
    highlights: [
      'Expandable TweakRow — click to see Rationale / Risk explanation / Source',
      'Recently Applied card on Dashboard',
      'Compare Presets matrix modal',
      'Preset glyphs across the UI (⚡ 🎯 🎬 ⏱ 🌐)',
    ],
  },
  {
    version: '0.1.20',
    date: '2026-05-07',
    highlights: [
      'Suggest a Tweak modal on Tweaks page — copy-as-message, email, Discord (when wired)',
      'Tweaks Preview drawer redesign — per-action cards with Before → After value boxes (replaces raw JSON)',
    ],
  },
  {
    version: '0.1.19',
    date: '2026-05-07',
    highlights: [
      'What\'s-New modal on first launch after upgrade — shows new entries since you last opened the app',
    ],
  },
  {
    version: '0.1.18',
    date: '2026-05-07',
    highlights: [
      'New Tune Score on Dashboard — 0-100 health grade with Stock / Lukewarm / Tuned / Tournament tiers',
      'Apply All Recommended button — batches every visible recommendation into one UAC',
    ],
  },
  {
    version: '0.1.17',
    date: '2026-05-07',
    highlights: [
      '4 bundled community presets — Laptop Tuning, iGPU Rig, Streamer Plus, Competitive FPS Pure',
      'Browse community button on Presets page — one-click import per preset',
    ],
  },
  {
    version: '0.1.16',
    date: '2026-05-07',
    highlights: [
      'Custom Preset Builder — pick any tweaks from the catalog, name + describe, save locally',
      'Export / Import as JSON for sharing presets with friends',
      'Landing site refreshed to v0.1.16 stats',
    ],
  },
  {
    version: '0.1.15',
    date: '2026-05-07',
    highlights: [
      'Catalog 60 tweaks: + Discord/Steam autostart-kill, + Bing-in-Start disable',
      'Per-tweak rig targeting (15 entries tagged) — recommendations sharpen per CPU/RAM/OS-build',
    ],
  },
  {
    version: '0.1.13',
    date: '2026-05-07',
    highlights: [
      '+5 tweaks from LLM extraction pass-3 — Driver Auto-Updates, SmartScreen, Zone Warning, MPO, Win11 Windowed-Game-Opt',
      'New Recommended Tweaks card on Dashboard — top 6 unapplied that match your rig',
    ],
  },
  {
    version: '0.1.11',
    date: '2026-05-06',
    highlights: [
      'Restore Point on Settings — one-click bulk revert under a single UAC',
      'Tweaks page gains free-text search + risk / admin / state filters',
    ],
  },
  {
    version: '0.1.9',
    date: '2026-05-06',
    highlights: [
      'PowerShell action engine — vetted scripts via base64-utf16-le encoding for cmd.exe safety',
      '+3 PowerShell tweaks: MMAgent compression off, Ultimate Performance scheme, Hibernation off',
    ],
  },
  {
    version: '0.1.6',
    date: '2026-05-06',
    highlights: [
      'BcdeditSet engine + 5 boot-store tweaks (TSC sync, hypervisor off, useplatformclock, etc)',
      'New Frame Pacing preset bundling boot-time timer overhauls',
    ],
  },
]
