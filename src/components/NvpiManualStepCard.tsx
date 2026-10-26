import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { applyNvpiFortniteExtreme, inTauri, nvpiStatus, restoreNvpiFortnite, type NvpiOperationResult, type NvpiStatus } from '../lib/tauri'
import { confirmAction } from '../lib/confirm'

interface NvpiManualStepCardProps {
  gpuVendor?: string | null
  /** Automatic apply is a gated desktop feature; the manual guide remains available without it. */
  canApply?: boolean
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Two-button NVIDIA Profile Inspector flow.
 *
 * NVPI owns the driver database, so the backend exports a full customized
 * profile before importing the app-owned Fortnite profile and then verifies
 * the exported Fortnite block. The card deliberately does not promise an FPS
 * result or try to change Fortnite's engine-side visibility/culling rules.
 */
export function NvpiManualStepCard({ gpuVendor, canApply = false }: NvpiManualStepCardProps) {
  const isNvidia = /nvidia|geforce|rtx|gtx/i.test(gpuVendor ?? '')
  const native = inTauri()
  const [status, setStatus] = useState<NvpiStatus | null>(null)
  const [busy, setBusy] = useState<'apply' | 'restore' | 'refresh' | null>(null)
  const [result, setResult] = useState<NvpiOperationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!native) return
    setBusy('refresh')
    setError(null)
    try {
      setStatus(await nvpiStatus())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (isNvidia && native) void refresh()
    // The desktop shell and detected GPU are stable while this card is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNvidia, native])

  if (!isNvidia) return null

  async function apply() {
    if (!native || !canApply) return
    const accepted = await confirmAction(
      'Apply the Fortnite Extreme NVIDIA profile? OptimizationMaxxing will export your current customized NVIDIA profiles first, import the 9-setting profile, and verify the exported result. This can change image quality and is not an FPS or latency guarantee.',
    )
    if (!accepted) return
    setBusy('apply')
    setError(null)
    setResult(null)
    try {
      const next = await applyNvpiFortniteExtreme()
      setResult(next)
      setStatus(await nvpiStatus())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function restore() {
    if (!native || !canApply || !status?.backupAvailable) return
    const accepted = await confirmAction(
      'Restore the NVIDIA customized-profile export saved before the last Fortnite Extreme apply? This imports the app-owned backup and verifies the exported Fortnite block afterward.',
    )
    if (!accepted) return
    setBusy('restore')
    setError(null)
    setResult(null)
    try {
      const next = await restoreNvpiFortnite()
      setResult(next)
      setStatus(await nvpiStatus())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const unavailableReason = !native
    ? 'Use the installed OptimizationMaxxing desktop app for automatic import.'
    : !canApply
      ? 'Automatic import is available in the VIP Asta flow; the manual guide remains available below.'
      : status === null
        ? 'Checking for an installed NVIDIA Profile Inspector…'
      : status?.available === false
        ? 'NVPI was not found in the common install, Downloads, Documents, or PATH locations.'
        : null

  return (
    <section
      className="rounded-md border border-amber-300/35 bg-amber-300/5 p-4 space-y-3"
      aria-label="Fortnite Extreme NVIDIA Profile Inspector profile"
    >
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-amber-200">NVIDIA driver profile</p>
        <h3 className="text-sm font-semibold text-text">Fortnite Extreme profile</h3>
        <p className="text-xs leading-relaxed text-text-muted">
          This is the aggressive normal-driver-controls profile: maximum performance power mode,
          VSync off, high-performance texture filtering, driver optimizations on, and FXAA/MFAA
          off. It may reduce image quality or add shimmer. The app exports your current customized
          profiles first, so the restore button has a real rollback file.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy !== null || !native || !canApply || status === null || status.available === false}
          className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-bg-base transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === 'apply' ? 'Applying and verifying…' : 'Apply Fortnite Extreme profile'}
        </button>
        <button
          type="button"
          onClick={() => void restore()}
          disabled={busy !== null || !native || !canApply || !status?.backupAvailable}
          className="rounded-md border border-amber-200/45 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === 'restore' ? 'Restoring and verifying…' : 'Restore previous NVIDIA profile'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
        <span className={status?.available ? 'text-emerald-200' : 'text-amber-200'}>
          {status?.available ? 'NVPI detected' : status === null && native ? 'Checking for NVPI…' : native ? 'NVPI not detected' : 'Desktop shell required'}
        </span>
        {status?.backupAvailable ? <span>· rollback backup ready</span> : <span>· no rollback backup yet</span>}
        {native && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy !== null}
            className="underline underline-offset-2 hover:text-text disabled:opacity-45"
          >
            {busy === 'refresh' ? 'checking…' : 'Refresh detection'}
          </button>
        )}
      </div>

      {unavailableReason && (
        <p className="rounded-md border border-border bg-bg-base/35 px-3 py-2 text-[11px] leading-snug text-text-muted">
          {unavailableReason}
        </p>
      )}

      {status?.detail && <p className="text-[10px] leading-snug text-text-subtle">{status.detail}</p>}
      {result && (
        <p className={`rounded-md border px-3 py-2 text-[11px] leading-snug ${result.verified ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : 'border-red-300/40 bg-red-300/10 text-red-100'}`}>
          {result.detail}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-red-300/40 bg-red-300/10 px-3 py-2 text-[11px] leading-snug text-red-100">
          NVPI operation failed: {error}
        </p>
      )}

      <div className="rounded-md border border-sky-300/25 bg-sky-300/5 px-3 py-2 space-y-1">
        <p className="text-[11px] font-semibold text-sky-100">Want items to stay visible farther away?</p>
        <p className="text-[11px] leading-snug text-text-muted">
          NVPI cannot force Fortnite to change its object culling distance. Use Fortnite&apos;s own
          View Distance setting if visibility is worth the frame-time cost; higher view distance
          can reduce performance. The shipped guide explains the tradeoff and gives the manual
          import fallback.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/guides#nvidia-profile-inspector"
          className="text-xs font-semibold text-sky-200 underline underline-offset-2 hover:text-text"
        >
          Open the NVPI guide and download fallback →
        </Link>
        <span className="text-[10px] text-text-subtle">Export read-back proves profile values, not gameplay gains.</span>
      </div>
    </section>
  )
}
