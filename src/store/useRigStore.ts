import { create } from 'zustand'
import { detectSpecs, inTauri, type SpecProfile } from '../lib/tauri'

export type RigLoadState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

interface RigState {
  spec: SpecProfile | null
  status: RigLoadState
  error: string | null
  /** Load the current snapshot once. Safe to call from multiple pages. */
  ensureLoaded: () => Promise<SpecProfile | null>
  /** Force a new native read after a BIOS, driver, RAM, or OS change. */
  refresh: () => Promise<SpecProfile | null>
  clearError: () => void
}

let inFlight: Promise<SpecProfile | null> | null = null

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : String(error)
}

function loadSnapshot(force: boolean, get: () => RigState, set: (next: Partial<RigState>) => void) {
  const current = get()
  if (!inTauri()) {
    set({ status: 'unavailable', error: null })
    return Promise.resolve(null)
  }
  if (!force && current.spec) return Promise.resolve(current.spec)
  if (inFlight) return inFlight

  set({ status: 'loading', error: null })
  inFlight = detectSpecs(force)
    .then((spec) => {
      set({ spec, status: 'ready', error: null })
      return spec
    })
    .catch((error) => {
      const message = errorMessage(error)
      set({ status: get().spec ? 'ready' : 'error', error: message })
      return null
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/**
 * One source of truth for hardware detection across the app.
 *
 * Detection is read-only and stays in the native Tauri shell. The browser
 * preview reports `unavailable` instead of manufacturing a fake PC profile.
 * A refresh updates every surface that consumes this store, so the Profile,
 * Tune Now, Dashboard, Hardware, and Diagnostics views cannot silently drift
 * apart after a driver/BIOS/RAM change.
 */
export const useRigStore = create<RigState>((set, get) => ({
  spec: null,
  status: 'idle',
  error: null,
  ensureLoaded: () => loadSnapshot(false, get, set),
  refresh: () => loadSnapshot(true, get, set),
  clearError: () => set({ error: null }),
}))
