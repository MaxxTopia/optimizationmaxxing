import { useState } from 'react'
import { inTauri, pingProbe, type PingResult } from '../lib/tauri'

/**
 * Multi-host ping probe. Curated list of gaming-relevant infrastructure:
 *   - 1.1.1.1 / 8.8.8.8 — anycast DNS, your nearest CDN edge
 *   - Riot regional API endpoints — NA / EU-West / EU-Nordic / KR / OCE
 *   - Epic anycast — your nearest Epic edge for Fortnite matchmaking
 *
 * Per-region absolute latency requires the actual game-server IP, which the
 * game only reveals after matchmaking. Use `netstat -no | findstr :7777`
 * (or 9000 / etc. depending on title) to grab it, then paste into the
 * "Custom" row to test.
 */

const TARGETS: Array<{ label: string; host: string; note: string }> = [
  { label: 'Cloudflare DNS (anycast)', host: '1.1.1.1', note: 'Your nearest Cloudflare edge — baseline latency' },
  { label: 'Google DNS (anycast)', host: '8.8.8.8', note: 'Cross-check with Cloudflare; large gap = ISP routing' },
  { label: 'Epic Fortnite matchmaking', host: 'ping.ds.on.epicgames.com', note: 'Anycast — resolves to your nearest Epic edge' },
  { label: 'Riot NA (na1)', host: 'na1.api.riotgames.com', note: 'Valorant / LoL NA — California datacenter' },
  { label: 'Riot EUW (euw1)', host: 'euw1.api.riotgames.com', note: 'Valorant / LoL EU-West — Amsterdam' },
  { label: 'Riot KR (kr)', host: 'kr.api.riotgames.com', note: 'Valorant / LoL Korea — Seoul' },
]

export function NetworkLatencyCard() {
  const [results, setResults] = useState<PingResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [customHost, setCustomHost] = useState('')
  const isNative = inTauri()

  async function run() {
    if (!isNative) {
      setErr('Latency probe requires the optimizationmaxxing.exe shell.')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const targets: Array<[string, string]> = TARGETS.map((t) => [t.label, t.host])
      if (customHost.trim().length > 0) {
        targets.push([`Custom (${customHost.trim()})`, customHost.trim()])
      }
      setResults(await pingProbe(targets))
    } catch (e) {
      setErr(formatErr(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="surface-card p-5 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-widest text-text-subtle">network</p>
        <h2 className="text-lg font-semibold">Latency probe</h2>
        <p className="text-sm text-text-muted max-w-2xl">
          Pings 6 gaming-relevant endpoints sequentially (4 packets each, ~6-8s total). For your
          actual game server: run <code className="text-accent">netstat -no</code> while in a
          match, find the established connection on the game's UDP port, paste the IP below.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={customHost}
          onChange={(e) => setCustomHost(e.target.value)}
          placeholder="Optional: paste game-server IP (from netstat) to add as 7th target"
          className="flex-1 min-w-64 px-3 py-1.5 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-xs"
        />
        <button
          onClick={run}
          disabled={loading || !isNative}
          className="px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
        >
          {loading ? 'Pinging…' : results ? 'Re-run' : 'Run probe'}
        </button>
      </div>

      {err && <p className="text-xs text-text-muted italic">{err}</p>}

      {results && results.length > 0 && (
        <div className="space-y-1">
          {results.map((r, i) => (
            <PingRow key={i} result={r} note={TARGETS[i]?.note} />
          ))}
        </div>
      )}
    </section>
  )
}

function PingRow({ result, note }: { result: PingResult; note?: string }) {
  const failed = result.received === 0 || result.avgMs == null
  const jitter =
    result.minMs != null && result.maxMs != null ? result.maxMs - result.minMs : null
  const latencyColor =
    failed
      ? 'text-text-subtle'
      : (result.avgMs ?? 0) < 30
      ? 'text-emerald-400'
      : (result.avgMs ?? 0) < 80
      ? 'text-text'
      : 'text-accent'

  return (
    <div className="border border-border rounded p-2 text-xs">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-text truncate">{result.label}</div>
          <div className="text-text-subtle truncate">{result.target}</div>
        </div>
        <div className="flex items-baseline gap-3 shrink-0 tabular-nums">
          {failed ? (
            <span className="text-text-subtle italic">timeout</span>
          ) : (
            <>
              <span className={`text-base font-bold ${latencyColor}`}>{result.avgMs}ms</span>
              <span className="text-text-subtle">
                min {result.minMs} · max {result.maxMs}
                {jitter != null && jitter > 10 ? (
                  <span className="text-accent ml-1">· jitter {jitter}ms</span>
                ) : null}
              </span>
              <span className="text-text-subtle">{result.received}/4</span>
            </>
          )}
        </div>
      </div>
      {note && <div className="text-text-subtle mt-0.5 text-[11px] italic">{note}</div>}
    </div>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
