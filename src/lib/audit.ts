/**
 * Catalog state audit. Per-tweak preview pass that compares each action's
 * captured pre-state against its target value — surfaces "is this already at
 * target?" without applying anything. Answers the user's question: "did this
 * tweak actually change anything, or was it already set?"
 *
 * Pure frontend — relies on the existing previewTweak Tauri command.
 */
import type { TweakRecord } from './catalog'
import { previewTweak, verifyAction, type TweakAction, type TweakPreview } from './tauri'

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
      if (pre == null) {
        return {
          index,
          status: 'differs',
          detail: `Value not present (target: ${formatScalar(action.value)})`,
        }
      }
      const obj = pre as { type?: string; value?: unknown }
      if (scalarEquals(obj.value, action.value)) {
        return { index, status: 'matches', detail: `Already ${formatScalar(action.value)}` }
      }
      return {
        index,
        status: 'differs',
        detail: `Currently ${formatScalar(obj.value)}, target ${formatScalar(action.value)}`,
      }
    }
    case 'registry_delete': {
      if (pre == null) return { index, status: 'matches', detail: 'Already deleted' }
      const obj = pre as { type?: string; value?: unknown }
      return {
        index,
        status: 'differs',
        detail: `Currently ${formatScalar(obj.value)}, target: deleted`,
      }
    }
    case 'bcdedit_set': {
      const target = String(action.value)
      if (
        pre &&
        typeof pre === 'object' &&
        (pre as { found?: string }).found === 'unknown'
      ) {
        return {
          index,
          status: 'unknown',
          detail: `BCD ${(action as { name: string }).name} = ${target} — preflight could not read it; needs an admin re-check`,
        }
      }
      const obj = pre as { value?: unknown }
      if (obj && scalarEquals(obj.value, action.value)) {
        return { index, status: 'matches', detail: `BCD already ${target}` }
      }
      return {
        index,
        status: 'differs',
        detail: `BCD currently ${formatScalar(obj?.value)}, target ${target}`,
      }
    }
    case 'powershell_script':
      return {
        index,
        status: 'unknown',
        detail: 'Script ran on apply, but this catalog action has no generic read-back contract; execution is not proof of lasting state.',
      }
    case 'file_write': {
      if (
        pre &&
        typeof pre === 'object' &&
        (pre as { existed?: boolean }).existed === true
      ) {
        const obj = pre as { contents_b64?: string }
        if (obj.contents_b64 === action.contents_b64) {
          return { index, status: 'matches', detail: 'File already byte-identical to target' }
        }
        return { index, status: 'differs', detail: 'File exists with different contents' }
      }
      return { index, status: 'differs', detail: 'File does not exist (target: write)' }
    }
    case 'display_refresh':
      return {
        index,
        status: 'unknown',
        detail: 'Display mode needs the native EDID/read-back verifier after apply.',
      }
  }
}

/** Audits one tweak. Runs previewTweak for each action in parallel. */
export async function auditTweak(tweak: TweakRecord): Promise<TweakAudit> {
  const actions = await Promise.all(tweak.actions.map(async (action, index) => {
    try {
      if (action.kind === 'powershell_script' && action.verify?.trim()) {
        const result = await verifyAction(action)
        return {
          index,
          status: result.status === 'verified'
            ? 'matches' as const
            : result.status === 'mismatch'
              ? 'differs' as const
              : 'unknown' as const,
          detail: result.detail,
        }
      }
      const preview = await previewTweak(action)
      return auditAction(action, preview, index)
    } catch (e) {
      return {
        index,
        status: 'error' as const,
        detail: e instanceof Error ? e.message : String(e),
      }
    }
  }))
  return aggregate(actions)
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
  const errors = actions.filter((a) => a.status === 'error').length
  const total = actions.length
  let status: TweakAuditStatus
  if (total === 0) status = 'unknown'
  else if (matches === total) status = 'matches'
  else if (differs === total) status = 'differs'
  else if (matches === 0 && unknown === total) status = 'unknown'
  else if (errors === total) status = 'error'
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
  if (typeof a === 'number' || typeof b === 'number') return String(a) === String(b)
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
