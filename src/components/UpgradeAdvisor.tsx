import { useState } from 'react'
import { GAMES, type GameId } from '../lib/games'
import { getUpgradeRecommendations, getUpgradeTestGuide } from '../lib/upgradeAdvisor'
import type { SpecProfile } from '../lib/tauri'

/**
 * Shows detected hardware as inventory and gives a repeatable, game-specific
 * way to decide whether an upgrade is justified. A spec scan alone cannot
 * identify a performance bottleneck or predict an FPS gain.
 */
export function UpgradeAdvisor({ spec }: { spec: SpecProfile }) {
  const [gameId, setGameId] = useState<GameId>('fortnite')
  const game = GAMES.find((item) => item.id === gameId) ?? GAMES[0]
  const guide = getUpgradeTestGuide(gameId)
  const recommendations = getUpgradeRecommendations(spec)
  const reportedMemorySpeed = spec.ram.configuredSpeedMts ?? spec.ram.speedMts

  return (
    <section className="surface-card p-6 border-l-4 border-l-accent">
      <p className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">upgrade advisor</p>
      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">Measure first. Upgrade only a proven limit.</h2>
      <p className="text-sm text-text-muted leading-relaxed mt-2 max-w-3xl">
        Your scan identifies parts; it does not benchmark the game, detect every bottleneck, or
        predict an upgrade gain. Pick a game for a controlled comparison plan.
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <h3 className="text-base font-bold text-text">Potential upgrade paths for these parts</h3>
          <p className="text-xs text-text-muted leading-relaxed mt-1">
            These are decision paths, not a shopping list. Read the compatibility line first: a
            CPU from another vendor normally requires a new motherboard, and often new memory.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {recommendations.map((recommendation) => (
            <article key={recommendation.title} className="rounded-lg border border-border bg-bg-raised/40 p-4 space-y-2">
              <h4 className="text-sm font-bold text-text">{recommendation.title}</h4>
              <AdvisorLine label="Why" value={recommendation.why} />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-subtle">Parts needed</p>
                <ul className="mt-1 list-disc list-inside text-xs text-text-muted leading-relaxed">
                  {recommendation.parts.map((part) => <li key={part}>{part}</li>)}
                </ul>
              </div>
              <AdvisorLine label="Compatibility check" value={recommendation.compatibility} />
              <AdvisorLine label="Best next step" value={recommendation.nextStep} />
            </article>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 mt-5 max-w-sm text-xs text-text-muted">
        Game
        <select
          value={gameId}
          onChange={(event) => setGameId(event.target.value as GameId)}
          className="rounded-md border border-border bg-bg-raised px-3 py-2 text-sm text-text focus:border-border-glow outline-none"
        >
          {GAMES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
        <InventoryItem label="CPU" value={spec.cpu.marketing || spec.cpu.model || 'Not reported'} />
        <InventoryItem label="GPU" value={[spec.gpu.vendor, spec.gpu.model].filter(Boolean).join(' ') || 'Not reported'} />
        <InventoryItem
          label="Memory"
          value={`${spec.ram.totalGb} GB${reportedMemorySpeed ? ` · ${reportedMemorySpeed} MT/s reported` : ''}${spec.ram.stickCount ? ` · ${spec.ram.stickCount} DIMM${spec.ram.stickCount === 1 ? '' : 's'}` : ''}`}
        />
        <InventoryItem label="Motherboard" value={[spec.mobo.manufacturer, spec.mobo.product].filter(Boolean).join(' ') || 'Not reported'} />
        <InventoryItem label="Windows" value={`${spec.os.displayVersion || spec.os.caption || 'Not reported'} · build ${spec.os.build || 'unknown'}`} />
      </div>

      <div className="mt-5 rounded-lg border border-border bg-bg-raised/40 p-4 space-y-2">
        <h3 className="text-sm font-bold text-text">{game.label} comparison</h3>
        <p className="text-sm text-text-muted leading-relaxed">{guide.scene}</p>
        <p className="text-sm text-text-muted leading-relaxed">{guide.metrics}</p>
      </div>

      <ul className="mt-4 space-y-1.5 text-xs text-text-muted leading-relaxed">
        <li>• Keep map, settings, driver, background apps, and capture setup fixed; change one component or setting at a time. Repeat runs and compare medians, frame times, 1% lows, GPU load, and per-core CPU behavior.</li>
        <li>• Total CPU utilization alone does not rule out a game-thread limit. A GPU limit needs sustained GPU saturation and a repeatable response to lower render load.</li>
        <li>• RAM inventory cannot reveal memory ICs or safe timing headroom. Check the exact kit, board and CPU memory controller; prove each manual change stable before using it in competition.</li>
      </ul>
      <p className="text-[11px] text-text-subtle mt-3">If the measured difference is within run-to-run variation, save the money and keep the current part.</p>
    </section>
  )
}

function AdvisorLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-text-muted leading-relaxed">
      <span className="font-semibold text-text">{label}:</span> {value}
    </p>
  )
}

function InventoryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3 min-w-0">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text break-words">{value}</p>
    </div>
  )
}
