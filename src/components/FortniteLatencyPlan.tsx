import { Link } from 'react-router-dom'

/**
 * A short, evidence-first order of operations for Fortnite. This is guidance,
 * not an auto-apply preset: the result depends on the current game build,
 * driver, display path, and whether the rig is CPU- or GPU-bound.
 */
export function FortniteLatencyPlan() {
  return (
    <section className="surface-card p-5 space-y-4 border-sky-500/30">
      <div>
        <p className="text-xs uppercase tracking-widest text-sky-300/80">Fortnite latency order</p>
        <h2 className="text-xl font-bold">Test the big levers before the tiny tweaks</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-muted">
          Faster edits and shots come from the whole click-to-pixel path. This order keeps the
          changes understandable and makes it harder to mistake a successful command for a
          measured latency win.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-text">1. Renderer and Reflex</p>
          <p className="text-[11px] leading-relaxed text-text-muted">
            If the current Fortnite build exposes Enhanced DX12 Performance Mode, compare it
            with the mode you use now. On NVIDIA, start with Reflex On, then compare On + Boost
            only if clocks or GPU-bound sections justify the extra power.
          </p>
        </div>
        <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-text">2. Cap and display path</p>
          <p className="text-[11px] leading-relaxed text-text-muted">
            Compare uncapped/VSync-off against a stable cap, and compare the VRR path separately.
            Keep the option with the lower worst frametime and better control on your monitor;
            there is no universal refresh-minus-three answer.
          </p>
        </div>
        <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-text">3. Input stability</p>
          <p className="text-[11px] leading-relaxed text-text-muted">
            Use 1000 Hz as the baseline. Test 2/4/8 kHz only when the same scene stays smooth;
            a higher polling number is not a win if it adds CPU work or frametime variance.
          </p>
        </div>
        <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-text">4. Hybrid CPU sets</p>
          <p className="text-[11px] leading-relaxed text-text-muted">
            Leave all detected CPU Set records selected first. IDs such as 56 are Windows labels,
            not core numbers or a performance score. The watcher is a soft preference, not a hard
            reservation; compare it against the no-watcher baseline before keeping it.
          </p>
        </div>
        <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-text">5. Power and thermals</p>
          <p className="text-[11px] leading-relaxed text-text-muted">
            The Ultimate Performance/Tournament plan can be a useful dedicated-session baseline,
            but keep it only if clocks remain stable without thermal throttling. More power draw
            is not automatically lower latency.
          </p>
        </div>
        <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-text">6. Network and NIC</p>
          <p className="text-[11px] leading-relaxed text-text-muted">
            Use Ethernet and fix loaded latency with router SQM/bufferbloat control. Fortnite
            gameplay is UDP, so TCP/Nagle tweaks do not lower in-match ping. Change one Intel NIC
            property at a time; never uncheck every binding or blindly disable offloads.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-text">What counts as a win</p>
        <p className="text-[11px] leading-relaxed text-text-muted">
          Keep the same Fortnite build, driver, map or Creative route, resolution, cap, display
          mode, mouse polling rate, and background load. Run at least three comparable captures,
          then check PresentMon frametimes and the worst spike in Match Scan. A registry read-back,
          synthetic ping, or higher FPS average alone cannot prove faster click-to-photon input.
        </p>
      </div>

      <Link to="/match-scan" className="inline-flex text-xs text-accent hover:underline">
        Open Match Scan / Fight Capture for the real-game check →
      </Link>
    </section>
  )
}
