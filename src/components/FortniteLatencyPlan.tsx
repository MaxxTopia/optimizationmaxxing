import { Link } from 'react-router-dom'

/** Practical A/B guidance; none of these settings is a universal preset. */
export function FortniteLatencyPlan() {
  return (
    <section className="surface-card p-5 space-y-4 border-sky-500/30">
      <div>
        <p className="text-xs uppercase tracking-widest text-sky-300/80">Fortnite setup</p>
        <h2 className="text-xl font-bold">Start with these three controlled tests</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-muted">
          Change one thing at a time. Keep the setting only when the same in-game test improves
          more than normal run-to-run variation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-bg-base/40 p-4 space-y-2">
          <p className="text-base font-semibold text-text">1. Render mode, Reflex, and cap</p>
          <p className="text-sm leading-relaxed text-text-muted">
            Compare the render modes available in your installed Fortnite build. On NVIDIA,
            test Reflex On against On + Boost; compare frame cap and VRR separately. A higher
            average FPS is not a win if worst frametimes or control feel get worse. Epic describes
            Performance Mode as an option for low frame rates, not a best setting for every PC.
          </p>
          <a href="https://www.epicgames.com/help/c-32735058/a20197720?lang=en-US" target="_blank" rel="noreferrer" className="inline-flex text-sm text-accent hover:underline">Epic: Fortnite Performance Mode ↗</a>
          <a href="https://www.nvidia.com/en-us/geforce/news/gfecnt/202009/fortnite-rtx-on-ray-tracing-nvidia-dlss-reflex/" target="_blank" rel="noreferrer" className="block text-sm text-accent hover:underline">NVIDIA: Reflex in Fortnite ↗</a>
        </div>
        <div className="rounded-md border border-border bg-bg-base/40 p-4 space-y-2">
          <p className="text-base font-semibold text-text">2. CPU sets and background watcher</p>
          <p className="text-sm leading-relaxed text-text-muted">
            Start with Windows scheduling and every detected CPU Set available. An ID like 56 is
            a Windows logical-processor label—not core 56, a speed rank, or a setting to guess.
            CPU-set assignment is a soft preference. If you test the watcher, start it, launch
            Fortnite, confirm it sees the game, and compare the same scene with the watcher off.
            Leave manual pinning alone unless repeated captures show a clear win.
          </p>
          <a href="https://learn.microsoft.com/en-us/windows/win32/procthread/cpu-sets" target="_blank" rel="noreferrer" className="inline-flex text-sm text-accent hover:underline">Microsoft: how CPU Sets work ↗</a>
        </div>
        <div className="rounded-md border border-border bg-bg-base/40 p-4 space-y-2">
          <p className="text-base font-semibold text-text">3. Ethernet, power, and temperatures</p>
          <p className="text-sm leading-relaxed text-text-muted">
            Keep required adapter bindings such as IPv4/IPv6 and QoS Packet Scheduler. DSCP is
            only a packet label; this PC's read-back cannot prove your router or game path honors
            it. Keep NIC defaults first, test one driver option at a time, and watch for clock or
            temperature throttling. More aggressive settings can reduce stability without helping.
          </p>
          <a href="https://learn.microsoft.com/en-us/powershell/module/netqos/get-netqospolicy?view=windowsserver2025-ps" target="_blank" rel="noreferrer" className="inline-flex text-sm text-accent hover:underline">Microsoft: inspect QoS policies ↗</a>
        </div>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 space-y-1.5">
        <p className="text-base font-semibold text-text">How to decide</p>
        <p className="text-sm leading-relaxed text-text-muted">
          Use the same build, driver, Creative route, graphics, cap, display, and background apps.
          Compare at least three captures in Match Scan; check 1%/0.1% lows and worst frametime.
          A successful command, synthetic ping, or higher average FPS alone does not prove lower
          input latency. Repeat after reboot to verify persistence.
        </p>
      </div>

      <Link to="/match-scan" className="inline-flex text-sm font-semibold text-accent hover:underline">
        Open Match Scan for a real-game comparison →
      </Link>
    </section>
  )
}
