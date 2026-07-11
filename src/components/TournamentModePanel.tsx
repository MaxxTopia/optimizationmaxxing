import { useEffect, useMemo, useState } from 'react'
import { GAMES, type GameId, getGame } from '../lib/games'
import { catalog } from '../lib/catalog'
import { inTauri } from '../lib/tauri'
import {
  gamePrimaryAc,
  nowStamp,
  readSchedule,
  writeSchedule,
  triggerRestoreNow,
  triggerRetryRevert,
  SCHEDULE_EVENT,
  type TournamentSchedule,
} from '../lib/tournamentDriver'

/**
 * Tournament Mode — temporal toggle for AC compliance.
 *
 * Schedule a match start time + game; at T-N minutes we batch-revert every
 * applied tweak that's flagged risky/breaking for that game's anti-cheat.
 * At T+M minutes we re-apply the same set. Survives app restarts via
 * localStorage. Polled every 30 s by an interval timer.
 *
 * Why this is gatekept: most pros have to manually revert HVCI / Hyper-V
 * before a Vanguard or BattlEye match, then restore after. That's a 5-minute
 * ritual every scrim. This automates it.
 */

/** Local-time ISO string for the next occurrence of HH:MM today (or tomorrow
 * if HH:MM is already in the past). Returned as ISO so localStorage survives
 * timezone-stable. */
function nextOccurrenceIso(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const now = new Date()
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  return target.toISOString()
}

function fmtCountdown(ms: number): string {
  if (ms < 0) return '0m 0s'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}

function fmtLocal(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TournamentModePanel() {
  const isNative = inTauri()
  const [schedule, setSchedule] = useState<TournamentSchedule | null>(() => readSchedule())
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Form state for new schedule.
  const [formGame, setFormGame] = useState<GameId>('valorant')
  const [formTime, setFormTime] = useState<string>(() => {
    // Default to 30 min from now, rounded to next 5-min boundary.
    const d = new Date(Date.now() + 30 * 60 * 1000)
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [formRevertBefore, setFormRevertBefore] = useState(5)
  const [formRestoreAfter, setFormRestoreAfter] = useState(30)

  // Tick the clock every 15 s + drive state-machine transitions.
  useEffect(() => {
    if (!schedule) return
    const tick = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(tick)
  }, [schedule])

  // The actual firing of revert/restore now lives in the always-mounted
  // <TournamentModeDriver/> (see src/lib/tournamentDriver.ts), so it survives
  // leaving this page — the old page-scoped driver silently stopped on navigate
  // = the ban-risk. This panel only REFLECTS the persisted schedule: re-read it
  // whenever the driver (or one of our own buttons) writes a change.
  useEffect(() => {
    const onChange = () => setSchedule(readSchedule())
    window.addEventListener(SCHEDULE_EVENT, onChange)
    return () => window.removeEventListener(SCHEDULE_EVENT, onChange)
  }, [])

  // Compute which tweaks WOULD be reverted if the user activates now (for
  // preview before they hit Start).
  const previewFlagged = useMemo(() => {
    if (!isNative) return []
    return previewSet(formGame)
  }, [formGame, isNative])

  function handleStart() {
    setErr(null)
    const matchStartIso = nextOccurrenceIso(formTime)
    const next: TournamentSchedule = {
      matchStartIso,
      game: formGame,
      revertBeforeMin: formRevertBefore,
      restoreAfterMin: formRestoreAfter,
      state: 'pending',
      revertedTweakIds: [],
      log: [`${nowStamp()} scheduled — match ${fmtLocal(matchStartIso)}`],
    }
    writeSchedule(next)
    setSchedule(next)
  }

  function handleCancel() {
    if (!schedule) return
    if (!confirm('Cancel scheduled tournament mode? Already-reverted tweaks STAY reverted (no restore).')) return
    writeSchedule(null)
    setSchedule(null)
  }

  async function handleRestoreNow() {
    if (!schedule || (schedule.state !== 'active' && schedule.state !== 'error')) return
    if (!confirm(`Re-apply all ${schedule.revertedTweakIds.length} reverted tweak(s) now?`)) return
    setErr(null)
    setBusy(true)
    try {
      await triggerRestoreNow()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  // Error state = a revert failed. Let the user re-attempt (re-prompts UAC).
  async function handleRetryRevert() {
    if (!schedule || schedule.state !== 'error') return
    setErr(null)
    setBusy(true)
    try {
      await triggerRetryRevert()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="surface-card p-6 space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">competition</p>
        <h2 className="text-xl font-semibold">Tournament Mode</h2>
        <p className="text-sm text-text-muted leading-snug max-w-3xl">
          Schedule a match → at T-N minutes we batch-revert every applied tweak the chosen
          game's anti-cheat would flag → at T+M minutes we re-apply the same set. Removes
          the 5-minute manual ritual most pros do before every Vanguard / BattlEye scrim.
          Survives app restarts via localStorage. Polled every 15 s.
        </p>
      </div>

      {!isNative && (
        <p className="text-xs text-text-subtle italic">
          Requires the optimizationmaxxing.exe shell.
        </p>
      )}

      {err && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          Error: {err}
        </div>
      )}

      {!schedule && (
        <ScheduleForm
          game={formGame}
          setGame={setFormGame}
          time={formTime}
          setTime={setFormTime}
          revertBefore={formRevertBefore}
          setRevertBefore={setFormRevertBefore}
          restoreAfter={formRestoreAfter}
          setRestoreAfter={setFormRestoreAfter}
          previewFlagged={previewFlagged}
          onStart={handleStart}
          disabled={!isNative}
        />
      )}

      {schedule && (
        <ActiveSchedule
          schedule={schedule}
          now={now}
          busy={busy}
          onCancel={handleCancel}
          onRestoreNow={handleRestoreNow}
          onRetryRevert={handleRetryRevert}
          onClear={() => {
            writeSchedule(null)
            setSchedule(null)
          }}
        />
      )}
    </section>
  )
}

function ScheduleForm({
  game,
  setGame,
  time,
  setTime,
  revertBefore,
  setRevertBefore,
  restoreAfter,
  setRestoreAfter,
  previewFlagged,
  onStart,
  disabled,
}: {
  game: GameId
  setGame: (g: GameId) => void
  time: string
  setTime: (t: string) => void
  revertBefore: number
  setRevertBefore: (n: number) => void
  restoreAfter: number
  setRestoreAfter: (n: number) => void
  previewFlagged: { id: string; title: string }[]
  onStart: () => void
  disabled: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Game">
          <select
            value={game}
            onChange={(e) => setGame(e.target.value as GameId)}
            className="w-full px-2 py-1.5 rounded-md bg-bg-card border border-border text-sm"
            disabled={disabled}
          >
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.glyph} {g.label} ({g.anticheat})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Match starts at (local)">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md bg-bg-card border border-border text-sm"
            disabled={disabled}
          />
        </Field>
        <Field label="Revert / restore (min)">
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={60}
              value={revertBefore}
              onChange={(e) => setRevertBefore(Number(e.target.value))}
              className="w-1/2 px-2 py-1.5 rounded-md bg-bg-card border border-border text-sm tabular-nums"
              disabled={disabled}
              title="Minutes BEFORE match to revert AC-flagged tweaks"
            />
            <input
              type="number"
              min={5}
              max={240}
              value={restoreAfter}
              onChange={(e) => setRestoreAfter(Number(e.target.value))}
              className="w-1/2 px-2 py-1.5 rounded-md bg-bg-card border border-border text-sm tabular-nums"
              disabled={disabled}
              title="Minutes AFTER match to re-apply"
            />
          </div>
        </Field>
      </div>

      <div className="border border-border rounded-md p-3 bg-bg-card/50">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle mb-1">
          will revert at T-{revertBefore}min ({previewFlagged.length} {previewFlagged.length === 1 ? 'tweak' : 'tweaks'})
        </p>
        {previewFlagged.length === 0 ? (
          <p className="text-xs text-text-subtle italic">
            No applied tweaks are flagged for {game}'s anti-cheat right now. Mode will run
            but won't have anything to revert. (Either you're already AC-clean, or no
            applied tweak has anticheatCompatibility tagged for this AC.)
          </p>
        ) : (
          <ul className="text-xs text-text-muted space-y-0.5 max-h-32 overflow-y-auto">
            {previewFlagged.map((t) => (
              <li key={t.id} className="flex items-baseline gap-2">
                <span className="text-text-subtle font-mono shrink-0">·</span>
                <span className="truncate">{t.title}</span>
                <span className="text-[10px] text-text-subtle font-mono ml-auto shrink-0">{t.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={onStart}
        disabled={disabled}
        className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
      >
        Schedule
      </button>
    </div>
  )
}

function ActiveSchedule({
  schedule,
  now,
  busy,
  onCancel,
  onRestoreNow,
  onRetryRevert,
  onClear,
}: {
  schedule: TournamentSchedule
  now: number
  busy: boolean
  onCancel: () => void
  onRestoreNow: () => void
  onRetryRevert: () => void
  onClear: () => void
}) {
  const matchMs = new Date(schedule.matchStartIso).getTime()
  const revertAt = matchMs - schedule.revertBeforeMin * 60_000
  const restoreAt = matchMs + schedule.restoreAfterMin * 60_000
  const game = getGame(schedule.game)

  let stateLabel = ''
  let stateColor = ''
  let countdown: number | null = null
  if (schedule.state === 'pending') {
    stateLabel = 'Pending'
    stateColor = 'text-amber-300'
    countdown = revertAt - now
  } else if (schedule.state === 'active') {
    stateLabel = 'Active — match in progress'
    stateColor = 'text-emerald-300'
    countdown = restoreAt - now
  } else if (schedule.state === 'error') {
    stateLabel = 'NOT SAFE — revert failed'
    stateColor = 'text-red-400'
  } else {
    stateLabel = 'Done — tweaks restored'
    stateColor = 'text-text-muted'
  }

  return (
    <div className="space-y-3">
      {schedule.state === 'error' && (
        <div className="rounded-md border-2 border-red-500 bg-red-500/15 px-4 py-3 text-sm text-red-200">
          <p className="font-bold text-red-300">⚠ NOT SAFE TO PLAY — a tweak failed to revert.</p>
          <p className="mt-1 text-xs leading-snug">
            One or more anti-cheat-flagged tweaks are STILL APPLIED (usually a missed or denied UAC
            prompt). Do not join your match until this is cleared. Hit <strong>Retry revert</strong> and
            approve the UAC prompt — the activity log below lists exactly which tweaks failed.
          </p>
        </div>
      )}

      {schedule.state === 'pending' && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug">
          Keep this app running until after your match — the revert fires from inside the app (any
          page is fine). If the app is fully closed at match time, the revert can’t run.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Match" value={fmtLocal(schedule.matchStartIso)} sub={game ? `${game.glyph} ${game.label}` : schedule.game} />
        <Stat
          label="State"
          value={<span className={stateColor}>{stateLabel}</span>}
          sub={
            schedule.state === 'pending'
              ? `Revert at T-${schedule.revertBeforeMin}min`
              : schedule.state === 'active'
              ? `Restore at T+${schedule.restoreAfterMin}min`
              : ''
          }
        />
        <Stat
          label={schedule.state === 'pending' ? 'Time to revert' : schedule.state === 'active' ? 'Time to restore' : 'Reverted'}
          value={
            countdown != null && countdown > 0 ? (
              <span className="tabular-nums">{fmtCountdown(countdown)}</span>
            ) : schedule.state === 'done' || schedule.state === 'error' ? (
              `${schedule.revertedTweakIds.length} tweak(s)`
            ) : (
              <span className="text-amber-300">due now</span>
            )
          }
          sub={busy ? 'working…' : ''}
        />
      </div>

      {schedule.log.length > 0 && (
        <details className="border border-border rounded-md p-3 bg-bg-card/30">
          <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-text-subtle hover:text-text">
            Activity log ({schedule.log.length})
          </summary>
          <ul className="mt-2 space-y-0.5 text-[11px] font-mono text-text-muted max-h-40 overflow-y-auto">
            {schedule.log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex gap-2 flex-wrap">
        {schedule.state === 'error' && (
          <button
            onClick={onRetryRevert}
            disabled={busy}
            className="px-3 py-1.5 rounded-md border border-red-500/60 bg-red-500/15 text-xs text-red-200 hover:border-red-400 disabled:opacity-50"
          >
            Retry revert
          </button>
        )}
        {(schedule.state === 'active' || schedule.state === 'error') && (
          <button
            onClick={onRestoreNow}
            disabled={busy}
            className="px-3 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-300 hover:border-emerald-500 disabled:opacity-50"
          >
            {schedule.state === 'error' ? 'Put tweaks back' : 'Restore now'}
          </button>
        )}
        {schedule.state !== 'done' ? (
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-xs text-amber-300 hover:border-amber-500 disabled:opacity-50"
          >
            Cancel schedule
          </button>
        ) : (
          <button
            onClick={onClear}
            className="px-3 py-1.5 rounded-md border border-border text-xs text-text-muted hover:text-text"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-text-subtle mb-1">{label}</p>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div className="border border-border rounded-md p-3">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="text-base font-semibold">{value}</p>
      {sub && <p className="text-xs text-text-subtle mt-0.5">{sub}</p>}
    </div>
  )
}

/** Preview which catalog tweaks (regardless of applied state) WOULD be flagged.
 * The schedule form uses this to show users what they're committing to.
 * Filters by applied state at fire time, not preview time. */
function previewSet(game: GameId): { id: string; title: string }[] {
  const ac = gamePrimaryAc(game)
  const out: { id: string; title: string }[] = []
  for (const t of catalog.tweaks) {
    let verdict: 'safe' | 'risk' | 'breaks' | undefined
    if (ac && t.anticheatCompatibility?.[ac]) {
      verdict = t.anticheatCompatibility[ac]
    } else {
      verdict = t.tournamentCompliance?.[game]
    }
    if (verdict === 'risk' || verdict === 'breaks') {
      out.push({ id: t.id, title: t.title })
    }
  }
  return out
}
