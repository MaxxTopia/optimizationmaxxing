/*
 * Optimizationmaxxing — frontend watchdog
 *
 * Makes a silent frontend failure LOUD instead of a frozen/blank UI. Catches
 * uncaught errors and unhandled promise rejections (which includes a failed
 * Tauri `invoke()` to the Rust backend) and, on a real-looking failure, shows a
 * dismissible banner with Reload + Copy-report. Ported from discordmaxxer's
 * DMVoiceGuard "make failures loud" pattern.
 *
 * To avoid crying wolf on one-off benign errors, the banner only appears on:
 *   - an unhandled promise rejection (usually a real async/IPC failure), OR
 *   - 2+ uncaught errors within 15s (a burst = something's actually broken).
 * Every error is still logged to a ring buffer for the report.
 *
 * NOT YET VERIFIED IN-APP — run the app, confirm it doesn't false-alarm on
 * normal use and that it shows on a real error, before relying on it / shipping.
 *
 * Self-installs on import. Wire by importing once at the app entry, or via a
 * <script type="module" src="/src/watchdog.ts"> in index.html.
 */

const MAXXTOPIA_DISCORD = "https://discord.gg/S78eecbWdx";
const RING_MAX = 40;
const BURST_WINDOW_MS = 15_000;

const ring: string[] = [];
let errTimes: number[] = [];
let bannerShown = false;
let total = 0;

function pushRing(line: string) {
    ring.push(`${new Date().toISOString()}  ${line}`.slice(0, 400));
    if (ring.length > RING_MAX) ring.shift();
}

function buildReport(): string {
    return [
        "Optimizationmaxxing — error report",
        `captured: ${new Date().toISOString()}`,
        `ua: ${navigator.userAgent}`,
        "",
        "recent errors:",
        ...(ring.length ? ring.slice(-20) : ["(none captured)"])
    ].join("\n");
}

function showBanner() {
    total++;
    if (bannerShown) {
        const c = document.getElementById("om-wd-count");
        if (c) c.textContent = total > 1 ? ` (${total})` : "";
        return;
    }
    bannerShown = true;

    const style = document.createElement("style");
    style.textContent = `
        .om-wd { position: fixed; top: 0; left: 50%; transform: translateX(-50%);
            z-index: 2147483647; margin-top: 8px; max-width: 560px; width: calc(100% - 32px);
            display: flex; align-items: center; gap: 10px; padding: 11px 13px; border-radius: 10px;
            background: #1b0d12; color: #f5e6ea; border: 1px solid #e25b6a;
            box-shadow: 0 8px 28px rgba(0,0,0,.5); font: 13px/1.35 system-ui, sans-serif; }
        .om-wd b { color: #ff8a98; }
        .om-wd .om-wd-msg { flex: 1; }
        .om-wd button { border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-weight: 600; font-size: 12.5px; white-space: nowrap; }
        .om-wd .om-wd-reload { background: #e25b6a; color: #fff; }
        .om-wd .om-wd-copy { background: #3a2b30; color: #f5e6ea; }
        .om-wd .om-wd-x { background: transparent; color: #c9b3b9; padding: 6px 8px; }
        .om-wd button:hover { filter: brightness(1.12); }`;
    document.head.appendChild(style);

    const el = document.createElement("div");
    el.className = "om-wd";
    el.setAttribute("role", "alert");

    const msg = document.createElement("div");
    msg.className = "om-wd-msg";
    msg.innerHTML = '<b>Something went wrong.</b> Optimizationmaxxing hit an error<span id="om-wd-count"></span>. A reload usually fixes it.';

    const reload = document.createElement("button");
    reload.className = "om-wd-reload";
    reload.textContent = "Reload";
    reload.onclick = () => location.reload();

    const copy = document.createElement("button");
    copy.className = "om-wd-copy";
    copy.textContent = "Copy report";
    copy.title = "Copies an error report. Paste it in the Maxxtopia Discord (" + MAXXTOPIA_DISCORD + ") to report it.";
    copy.onclick = () => {
        const report = buildReport();
        const done = () => {
            copy.textContent = "Copied — paste in Discord";
            setTimeout(() => (copy.textContent = "Copy report"), 3000);
        };
        try {
            navigator.clipboard.writeText(report).then(done, done);
        } catch {
            done();
        }
    };

    const close = document.createElement("button");
    close.className = "om-wd-x";
    close.textContent = "✕";
    close.setAttribute("aria-label", "Dismiss");
    close.onclick = () => {
        el.remove();
        style.remove();
        bannerShown = false;
        errTimes = [];
    };

    el.append(msg, reload, copy, close);
    document.body.appendChild(el);
}

window.addEventListener("error", e => {
    pushRing(`error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
    const t = Date.now();
    errTimes.push(t);
    errTimes = errTimes.filter(x => t - x <= BURST_WINDOW_MS);
    if (errTimes.length >= 2) showBanner(); // burst = real breakage
});

window.addEventListener("unhandledrejection", e => {
    const r: any = e.reason;
    pushRing(`unhandledrejection: ${r && r.message ? r.message : String(r)}`);
    showBanner(); // a rejected promise/invoke is usually a real failure
});
