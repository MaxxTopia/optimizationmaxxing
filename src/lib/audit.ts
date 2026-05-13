/**
 * Catalog state audit. Per-tweak preview pass that compares each action's
 * captured pre-state against its target value — surfaces "is this already at
 * target?" without applying anything. Answers the user's question: "did this
 * tweak actually change anything, or was it already set?"
 *
 * Pure frontend — relies on the existing previewTweak Tauri command.
 */
import type { TweakRecord } from './catalog'
import { previewTweak, type TweakAction, type TweakPreview } from './tauri'

export type ActionAuditStatus = 'matches' | 'differs' | 'unknown' | 'error'

export interface ActionAudit {
  index: number
  status: ActionAuditStatus
  /** Human-readable hint surfaced in the expanded row. */
  detail: string
}

/** Aggregate per-tweak status. `partial` = some actions match, some differ. */
export type TweakAuditStatus =
  | 'matches'
  | 'differs'
  | 'partial'
  | 'unknown'
  | 'error'

export interface TweakAudit {
  status: TweakAuditStatus
  actions: ActionAudit[]
  matchCount: number
  total: number
  scannedAt: string
}

/** Compares one action against its preview pre-state. */
export function auditAction(
  action: TweakAction,
  preview: TweakPreview,
  index: number,
): ActionAudit {
  const pre = preview.preState as unknown
  switch (action.kind) {
    case 'registry_set': {
      // pre is null if value didn't exist, else { type, value }.
      if (pre == null) {
        return {
          index,
          status: 'differs',
          detail: `Value not present (target: ${formatScalar(action.value)})`,
        }
      }
      const obj = pre as { type?: string; value?: unknown }
      if (scalarEquals(obj.value, action.value)) {
        return {
          index,
          status: 'matches',
          detail: `Already ${formatScalar(action.value)}`,
        }
      }
      return {
        index,
        status: 'differs',
        detail: `Currently ${formatScalar(obj.value)}, target ${formatScalar(action.value)}`,
      }
    }
    case 'registry_delete': {
      if (pre == null) {
        return {
          index,
          status: 'matches',
          detail: 'Already deleted',
        }
      }
      const obj = pre as { type?: string; value?: unknown }
      return {
        index,
        status: 'differs',
        detail: `Currently ${formatScalar(obj.value)}, target: deleted`,
      }
    }
    case 'bcdedit_set': {
      // pre shape from elevation pre-state capture: { found: 'unknown' } or
      // { value: '<bcd value>' } — engine returns best-effort.
      if (
        pre &&
        typeof pre === 'object' &&
        (pre as { found?: string }).found === 'unknown'
      ) {
        return {
          index,
          status: 'unknown',
          detail: 'BCD value needs admin to read — relaunch as admin to see current state',
        }
      }
      const obj = pre as { value?: unknown }
      if (obj && scalarEquals(obj.value, action.value)) {
        return {
          index,
          status: 'matches',
          detail: `BCD already ${String(action.value)}`,
        }
      }
      return {
        index,
        status: 'unknown',
        detail: 'BCD value differs in a way we can\'t parse cleanly — apply + revert is safe to verify',
      }
    }
    case 'powershell_script':
      return {
        index,
        status: 'unknown',
        detail: 'Script-based tweak (e.g. clears caches, kills services) — has no static "before" value to compare. Snapshot stores the pre-state so revert still works.',
      }
    case 'file_write': {
      // pre_state shape: { existed: bool, contents_b64?: string, sha256?: string, size_bytes?: number }
      if (
        pre &&
        typeof pre === 'object' &&
        (pre as { existed?: boolean }).existed === true
      ) {
        const obj = pre as { contents_b64?: string }
        if (obj.contents_b64 === action.contents_b64) {
          return {
            index,
            status: 'matches',
            detail: 'File already byte-identical to target',
          }
        }
        return {
          index,
          status: 'differs',
          detail: 'File exists with different contents',
        }
      }
      return {
        index,
        status: 'differs',
        detail: 'File does not exist (target: write)',
      }
    }
  }
}

/** Audits one tweak. Runs previewTweak for each action in parallel. */
export async function auditTweak(tweak: TweakRecord): Promise<TweakAudit> {
  try {
    const previews = await Promise.all(tweak.actions.map((a) => previewTweak(a)))
    const actions = tweak.actions.map((a, i) => auditAction(a, previews[i], i))
    return aggregate(actions)
  } catch (e) {
    return {
      status: 'error',
      actions: [],
      matchCount: 0,
      total: tweak.actions.length,
      scannedAt: new Date().toISOString(),
    }
  }
}

/** Audits many tweaks with bounded concurrency. */
export async function auditMany(
  tweaks: TweakRecord[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 8,
): Promise<Record<string, TweakAudit>> {
  const out: Record<string, TweakAudit> = {}
  let i = 0
  let done = 0
  async function worker() {
    while (i < tweaks.length) {
      const idx = i++
      const t = tweaks[idx]
      out[t.id] = await auditTweak(t)
      done++
      onProgress?.(done, tweaks.length)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tweaks.length) }, () => worker()),
  )
  return out
}

function aggregate(actions: ActionAudit[]): TweakAudit {
  const matches = actions.filter((a) => a.status === 'matches').length
  const differs = actions.filter((a) => a.status === 'differs').length
  const unknown = actions.filter((a) => a.status === 'unknown').length
  const total = actions.length
  let status: TweakAuditStatus
  if (total === 0) status = 'unknown'
  else if (matches === total) status = 'matches'
  else if (differs === total) status = 'differs'
  else if (matches === 0 && unknown === total) status = 'unknown'
  else status = 'partial'
  return {
    status,
    actions,
    matchCount: matches,
    total,
    scannedAt: new Date().toISOString(),
  }
}

function scalarEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  // dword/qword vs JSON number: normalize via String()
  if (typeof a === 'number' || typeof b === 'number') {
    return String(a) === String(b)
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => scalarEquals(v, b[i]))
  }
  return false
}

function formatScalar(v: unknown): string {
  if (v == null) return '∅'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return `"${v}"`
  if (Array.isArray(v)) return `[${v.length}]`
  return JSON.stringify(v)
}
