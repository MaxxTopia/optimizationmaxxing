import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

import { inTauri } from '../lib/tauri'

/**
 * Tauri updater banner. On app mount we ask GitHub releases' latest.json
 * for the most recent build; if there's a newer version than the running
 * one we render an in-app banner above the main page. The user can apply
 * the update with one click — the plugin downloads + verifies the
 * minisign signature against the bundled public key + relaunches into
 * the new build.
 *
 * Failures (no internet, GitHub rate-limit, signature mismatch) keep the app
 * usable but are surfaced with a retry action so "no update" is not confused
 * with "the check failed".
 */

interface BannerState {
  available: Update | null
  checking: boolean
  downloading: boolean
  installed: boolean
  checkError: string | null
  errorMsg: string | null
}

const DISMISSED_KEY = 'optmaxxing-update-dismissed-version'

function readDismissedVersion(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

export function UpdateBanner() {
  const [state, setState] = useState<BannerState>({
    available: null,
    checking: true,
    downloading: false,
    installed: false,
    checkError: null,
    errorMsg: null,
  })
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    readDismissedVersion(),
  )

  async function checkForUpdate() {
    if (!inTauri()) {
      setState((s) => ({ ...s, checking: false }))
      return
    }

    setState((s) => ({ ...s, checking: true, checkError: null }))
    try {
      const update = await check()
      setState((s) => ({ ...s, checking: false, available: update, checkError: null }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Keep the app usable, but make a failed check visible. A silent failure
      // is indistinguishable from "already current" and can strand users on
      // an older build until they discover the problem themselves.
      // eslint-disable-next-line no-console
      console.warn('[updater] check failed:', e)
      setState((s) => ({ ...s, checking: false, checkError: message }))
    }
  }

  useEffect(() => {
    void checkForUpdate()
  }, [])

  // Suppress only when the user explicitly said "later" on THIS version. A
  // newer release wipes the suppression so the next genuine upgrade still
  // surfaces. Persisted in localStorage so the suppression survives navigation
  // + relaunches.
  const suppressed =
    !!state.available && dismissedVersion === state.available.version
  if (state.checkError) {
    return (
      <div
        className="surface-card mx-6 mt-4 px-4 py-3 flex items-center gap-3 flex-wrap"
        style={{
          borderColor: 'rgba(234, 179, 8, 0.45)',
          background: 'rgba(234, 179, 8, 0.06)',
        }}
        role="status"
        aria-live="polite"
      >
        <span className="text-lg" aria-hidden="true">↻</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">Couldn’t check for updates</p>
          <p className="text-xs text-text-muted mt-0.5">
            The app is still usable. Retry so you don’t miss a newer signed build.
          </p>
        </div>
        <button
          onClick={() => void checkForUpdate()}
          disabled={state.checking}
          className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
        >
          {state.checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
    )
  }

  if (!state.available || suppressed) return null

  function dismiss() {
    if (!state.available) return
    try {
      window.localStorage.setItem(DISMISSED_KEY, state.available.version)
    } catch {
      // localStorage unavailable — fall back to in-memory dismissal so the
      // banner still goes away for the rest of this session.
    }
    setDismissedVersion(state.available.version)
  }

  async function applyUpdate() {
    if (!state.available) return
    setState((s) => ({ ...s, downloading: true, errorMsg: null }))
    try {
      await state.available.downloadAndInstall()
      setState((s) => ({ ...s, downloading: false, installed: true }))
      // Brief beat so the user sees "installed" before the relaunch.
      await new Promise((r) => setTimeout(r, 1200))
      await relaunch()
    } catch (e) {
      setState((s) => ({
        ...s,
        downloading: false,
        errorMsg: typeof e === 'string' ? e : (e as Error).message ?? String(e),
      }))
    }
  }

  return (
    <div
      className="surface-card mx-6 mt-4 px-4 py-3 flex items-center gap-3 flex-wrap"
      style={{
        borderColor: 'rgba(212, 175, 55, 0.45)',
        background:
          'linear-gradient(120deg, rgba(212, 175, 55, 0.08) 0%, rgba(89, 13, 26, 0.12) 100%)',
      }}
    >
      <span className="text-lg" aria-hidden="true">⬆</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text">
          v{state.available.version} is out{' '}
          <span className="text-text-muted font-normal">
            (you're on v{state.available.currentVersion})
          </span>
        </p>
        {state.errorMsg ? (
          <p className="text-xs text-red-400 mt-0.5">Update failed: {state.errorMsg}</p>
        ) : state.installed ? (
          <p className="text-xs text-emerald-300 mt-0.5">Installed — relaunching…</p>
        ) : (
          <p className="text-xs text-text-muted mt-0.5">
            Auto-downloads + verifies the signed installer + relaunches into the new build.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={applyUpdate}
          disabled={state.downloading || state.installed}
          className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
        >
          {state.downloading ? 'Downloading…' : state.installed ? 'Installed ✓' : 'Update now'}
        </button>
        <button
          onClick={dismiss}
          className="text-text-subtle hover:text-text text-xs underline"
        >
          later
        </button>
      </div>
    </div>
  )
}
