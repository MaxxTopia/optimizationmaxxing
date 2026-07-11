import { getGame, type GameId } from './games'
import { catalog, type AnticheatId } from './catalog'
import {
  applyBatch,
  inTauri,
  listApplied,
  revertTweak,
  type AppliedTweak,
  type BatchItem,
} from './tauri'

/**
 * Tournament Mode driver — the SAFETY-CRITICAL state machine, extracted out of
 * the UI so it runs regardless of which page is open (or whether the panel is
 * even mounted).
 *
 * Why this lives here and not in TournamentModePanel:
 *   The old driver was a React effect inside the panel, which is mounted only on
 *   the Asta page. Navigating away (or the app being backgrounded off that page)
 *   unmounted it, so the scheduled "revert anti-cheat-breaking tweaks before my
 *   match" NEVER FIRED -> the player joined with breaking tweaks live = ban.
 *   Now `reconcile()` is driven by an always-mounted <TournamentModeDriver/> and
 *   also runs once on app launch, so it survives navigation and app restarts.
 *
 * Honest coverage limit: this runs INSIDE the app process, so it does NOT fire
 * if the app is fully CLOSED at match time. The panel shows a hard warning to
 * keep the app open. (Full app-closed coverage would need a Windows scheduled
 * task calling the engine headless — a separate, larger change.)
 *
 * Loud-fail invariant: if ANY revert fails (e.g. a missed/denied UAC prompt),
 * the schedule goes to state 'error' — a blocking RED "NOT SAFE TO PLAY" — and
 * NEVER silently advances to the green 'active'/"AC-clean" state.
 */

export const SCHEDULE_KEY = 'optmaxxing-tournament-schedule'
/** Fired on the window after every schedule write so the panel re-reads. */
export const SCHEDULE_EVENT = 'tm-schedule-changed'

export interface TournamentSchedule {
  /** ISO datetime string. */
  matchStartIso: string
  game: GameId
  revertBeforeMin: number
  restoreAfterMin: number
  /** State machine. 'error' = a revert failed; NOT safe to play. */
  state: 'pending' | 'active' | 'done' | 'error'
  /** Tweak IDs we reverted (so we re-apply the same set later). */
  revertedTweakIds: string[]
  /** Status messages (last few; truncated). */
  log: string[]
}

/** Re-entrancy guard: a revert can take seconds + a UAC prompt; never let the
 * 15s interval (or a manual trigger) overlap another run. */
let running = false

export function isReconciling(): boolean {
  return running
}

export function readSchedule(): TournamentSchedule | null {
  try {
    const raw = localStorage.getItem(SCHEDULE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as TournamentSchedule
    if (!s.matchStartIso || !s.game || !s.state) return null
    return s
  } catch {
    return null
  }
}

export function writeSchedule(s: TournamentSchedule | null): void {
  if (s == null) {
    localStorage.removeItem(SCHEDULE_KEY)
  } else {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(s))
  }
  try {
    window.dispatchEvent(new Event(SCHEDULE_EVENT))
  } catch {
    /* non-browser context — ignore */
  }
}

/** Map a game to its primary anti-cheat. */
export function gamePrimaryAc(game: GameId): AnticheatId | null {
  const g = getGame(game)
  if (!g) return null
  if (g.anticheat === 'none') return null
  return g.anticheat as AnticheatId
}

export function nowStamp(): string {
  return new Date().toLocaleTimeString()
}

export function stringErr(e: unknown): string {
  if (e == null) return 'unknown error'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return String(e)
}

/** Pick currently-applied tweaks flagged risky/breaking for the game's AC. */
export function pickFlaggedTweaks(
  applied: AppliedTweak[],
  game: GameId,
  ac: AnticheatId | null,
): AppliedTweak[] {
  const out: AppliedTweak[] = []
  for (const a of applied) {
    if (a.status !== 'applied') continue
    const tweak = catalog.tweaks.find((t) => t.id === a.tweakId)
    if (!tweak) continue
    let verdict: 'safe' | 'risk' | 'breaks' | undefined
    if (ac && tweak.anticheatCompatibility?.[ac]) {
      verdict = tweak.anticheatCompatibility[ac]
    } else {
      verdict = tweak.tournamentCompliance?.[game]
    }
    if (verdict === 'risk' || verdict === 'breaks') {
      out.push(a)
    }
  }
  return out
}

/** Revert every still-applied flagged tweak. Returns the next schedule: 'active'
 * if all cleared, 'error' if ANY failed (loud-fail — never silently 'active'). */
async function performRevert(schedule: TournamentSchedule): Promise<TournamentSchedule> {
  const ac = gamePrimaryAc(schedule.game)
  const list = await listApplied()
  // pickFlaggedTweaks filters status==='applied', so on a retry the already-
  // reverted tweaks are excluded — we only re-attempt the ones still applied.
  const flagged = pickFlaggedTweaks(list, schedule.game, ac)
  const reverted = [...schedule.revertedTweakIds]
  const failures: string[] = []
  const newLog: string[] = []
  for (const a of flagged) {
    try {
      await revertTweak(a.receiptId)
      if (!reverted.includes(a.tweakId)) reverted.push(a.tweakId)
      newLog.push(`reverted ${a.tweakId}`)
    } catch (e) {
      failures.push(a.tweakId)
      newLog.push(`FAILED revert ${a.tweakId}: ${stringErr(e)}`)
    }
  }
  const headline =
    failures.length > 0
      ? `${nowStamp()} REVERT FAILED - ${failures.length} tweak(s) STILL APPLIED - NOT SAFE TO PLAY (retry / approve the UAC prompt)`
      : `${nowStamp()} reverted ${reverted.length} tweak(s) for ${schedule.game}`
  return {
    ...schedule,
    state: failures.length > 0 ? 'error' : 'active',
    revertedTweakIds: reverted,
    log: [headline, ...newLog, ...(schedule.log ?? [])].slice(0, 30),
  }
}

/** Re-apply the reverted set (restore after the match). */
async function performRestore(schedule: TournamentSchedule): Promise<TournamentSchedule> {
  const items: BatchItem[] = []
  for (const tweakId of schedule.revertedTweakIds) {
    const t = catalog.tweaks.find((x) => x.id === tweakId)
    if (!t) continue
    for (const action of t.actions) {
      items.push({ tweakId, action })
    }
  }
  if (items.length > 0) {
    await applyBatch(items)
  }
  return {
    ...schedule,
    state: 'done',
    log: [
      `${nowStamp()} restored ${schedule.revertedTweakIds.length} tweak(s)`,
      ...(schedule.log ?? []),
    ].slice(0, 30),
  }
}

/**
 * One driver step. Called on app launch and every 15s by <TournamentModeDriver/>.
 * Fires the revert at T-revertBefore and the restore at T+restoreAfter. Never
 * auto-acts on 'error' (that requires a user retry so we don't spam UAC prompts).
 */
export async function reconcile(): Promise<void> {
  if (running || !inTauri()) return
  const schedule = readSchedule()
  if (!schedule) return
  const matchMs = new Date(schedule.matchStartIso).getTime()
  const revertAt = matchMs - schedule.revertBeforeMin * 60_000
  const restoreAt = matchMs + schedule.restoreAfterMin * 60_000
  const nowMs = Date.now()

  const needRevert = schedule.state === 'pending' && nowMs >= revertAt
  const needRestore = schedule.state === 'active' && nowMs >= restoreAt
  if (!needRevert && !needRestore) return

  running = true
  try {
    if (needRevert) {
      writeSchedule(await performRevert(schedule))
    } else if (needRestore) {
      writeSchedule(await performRestore(schedule))
    }
  } finally {
    running = false
  }
}

/** User-triggered "Retry revert" from the error state (re-prompts UAC). */
export async function triggerRetryRevert(): Promise<void> {
  if (running) return
  const schedule = readSchedule()
  if (!schedule || schedule.state !== 'error') return
  running = true
  try {
    writeSchedule(await performRevert(schedule))
  } finally {
    running = false
  }
}

/** User-triggered "Restore now" (from active or error — puts reverted tweaks back). */
export async function triggerRestoreNow(): Promise<void> {
  if (running) return
  const schedule = readSchedule()
  if (!schedule || (schedule.state !== 'active' && schedule.state !== 'error')) return
  running = true
  try {
    writeSchedule(await performRestore(schedule))
  } finally {
    running = false
  }
}
