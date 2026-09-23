import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog'
import { inTauri } from './tauri'

/**
 * Tauri's dialog plugin exposes confirm as an async API. Keep confirmation
 * calls explicit so the browser preview and desktop shell share cancel
 * semantics and ACL failures are caught by the caller.
 */
export async function confirmAction(message: string): Promise<boolean> {
  if (!inTauri()) return window.confirm(message)
  return tauriConfirm(message)
}
