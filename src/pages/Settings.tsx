import { useEffect, useState } from 'react'
import { PROFILE_ORDER, profiles } from '../theme/profiles'
import { useProfileStore } from '../store/useProfileStore'
import {
  inTauri,
  listApplied,
  revertAllApplied,
  telemetryGet,
  telemetrySet,
  type RevertAllReport,
  type TelemetrySettings,
} from '../lib/tauri'

export function Settings() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const setProfile = useProfileStore((s) => s.setProfile)

  const [activeCount, setActiveCount] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastReport, setLastReport] = useState<RevertAllReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!inTauri()) return
    listApplied()
      .then((rows) => setActiveCount(rows.filter((r) => r.status === 'applied').length))
      .catch(() => {})
  }, [])

  async function refreshCount() {
    try {
      const rows = await listApplied()
      setActiveCount(rows.filter((r) => r.status === 'applied').length)
    } catch {
      /* ignore */
    }
  }

  async function handleRevertAll() {
    setBusy(true)
    setError(null)
    try {
      const report = await revertAllApplied()
      setLastReport(report)
      setConfirmOpen(false)
      await refreshCount()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">configuration</p>
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Theme</h2>
          <p className="text-sm text-text-muted">
            Switch the dashboard's profile theme. Each one is a complete visual identity, not just
            an accent swap.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PROFILE_ORDER.map((id) => {
            const p = profiles[id]
            const isActive = id === activeProfile
            return (
              <button
                key={id}
                onClick={() => setProfile(id)}
                className={`surface-card p-4 text-left transition ${
                  isActive ? 'border-border-glow shadow-accent-glow' : ''
                }`}
              >
                <span
                  className="block h-12 rounded mb-3"
                  style={{
                    background: `linear-gradient(135deg, ${p.swatch.primary}, ${p.swatch.secondary})`,
                  }}
                />
                <span className="block text-sm font-semibold text-text">{p.label}</span>
                <span className="block text-xs text-text-subtle mt-1">{p.blurb}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Restore Point</h2>
          <p className="text-sm text-text-muted">
            One-click reversion of every tweak you've applied. Privileged reverts batch into a single
            UAC prompt; HKCU reverts run silently. Use this if a preset destabilized your rig and
            you want to baseline back to vanilla Windows.
          </p>
        </div>
        <div className="surface-card p-6 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-text-muted">Currently applied tweaks</div>
            <div className="text-3xl font-bold mt-1">{activeCount}</div>
            {lastReport && (
              <div className="mt-3 text-xs text-text-subtle">
                Last revert: {lastReport.reverted}/{lastReport.totalActive} reverted
                {lastReport.failedReceiptIds.length > 0 && (
                  <span className="text-accent">
                    {' '}
                    · {lastReport.failedReceiptIds.length} failed
                  </span>
                )}
              </div>
            )}
            {error && (
              <div className="mt-3 text-xs text-accent">Error: {error}</div>
            )}
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={busy || activeCount === 0}
            className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Reverting…' : 'Revert All Applied'}
          </button>
        </div>
      </section>

      <TelemetrySection />

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="surface-card p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold">Revert {activeCount} applied tweak{activeCount === 1 ? '' : 's'}?</h3>
            <p className="text-sm text-text-muted">
              This walks every applied receipt newest-first and replays the captured pre-state.
              Privileged reverts will trigger a single UAC prompt. Reverts that fail (e.g. removed
              registry keys) stay marked as applied.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md border border-border text-sm hover:border-border-glow"
              >
                Cancel
              </button>
              <button
                onClick={handleRevertAll}
                disabled={busy}
                className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-50"
              >
                {busy ? 'Reverting…' : `Revert ${activeCount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TelemetrySection() {
  const isNative = inTauri()
  const [settings, setSettings] = useState<TelemetrySettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!isNative) return
    telemetryGet()
      .then(setSettings)
      .catch((e) => setErr(String(e)))
  }, [isNative])

  if (!isNative) return null

  async function toggle() {
    if (!settings) return
    setBusy(true)
    setErr(null)
    try {
      const next = await telemetrySet(!settings.enabled)
      setSettings(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Anonymous usage stats</h2>
        <p className="text-sm text-text-muted">
          Off by default. If you turn this on, the app sends an anonymous device
          hash + which tweaks/presets you applied + your Asta Bench composite to
          our Cloudflare worker. We use it to publish "X% of users on Asta Mode
          see +Y composite" stats — no personal data, no IP logging beyond what
          Cloudflare needs to route the request, no correlation with your VIP
          claim record (different salt). Off-switch reverts immediately and
          deletes the local device id.
        </p>
      </div>
      <div className="surface-card p-6 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-muted">Status</div>
          <div className="text-3xl font-bold mt-1">
            {settings?.enabled ? 'Sharing' : 'Off'}
          </div>
          {settings?.enabled && settings.device_id && (
            <div className="mt-3 text-[11px] text-text-subtle font-mono">
              device id · {settings.device_id}
            </div>
          )}
          {err && <div className="mt-3 text-xs text-accent">Error: {err}</div>}
        </div>
        <button
          onClick={toggle}
          disabled={busy || !settings}
          className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? '…' : settings?.enabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </section>
  )
}
