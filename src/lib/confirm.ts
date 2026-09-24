import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog'
import { inTauri } from './tauri'

/**
 * Tauri's dialog plugin exposes confirm as an async API. Keep confirmation
 * calls explicit so the browser preview and desktop shell share cancel
 * semantics and ACL failures are caught by the caller.
 */
export async function confirmAction(message: string): Promise<boolean> {
  if (!inTauri()) return window.confirm(message)
  try {
    return await tauriConfirm(message)
  } catch (error) {
    // Older installed shells can have a stale generated ACL even though the
    // current capability grants dialog confirmation. Falling back to the
    // webview's native confirm keeps a safety gate from becoming an opaque
    // "plugin:dialog|confirm not allowed by ACL" dead end. The caller still
    // receives a real yes/no decision; no mutation happens automatically.
    console.warn('[confirmAction] Tauri dialog unavailable; using webview fallback', error)
    return window.confirm(message)
  }
}
