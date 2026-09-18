import type { SpecProfile } from './tauri'

export interface RigContextSummary {
  cpu: string
  gpu: string
  memory: string
  os: string
  board: string
  captured: string
  notices: Array<{ tone: 'info' | 'warn'; text: string }>
}

function clean(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function formatOs(spec: SpecProfile): string {
  const name = clean(spec.os.caption || spec.os.edition, 'Windows')
  const version = clean(spec.os.displayVersion, '')
  const build = spec.os.build > 0 ? `build ${spec.os.build}${spec.os.ubr ? `.${spec.os.ubr}` : ''}` : ''
  return [name, version, build].filter(Boolean).join(' · ')
}

function formatMemory(spec: SpecProfile): string {
  const parts = [`${spec.ram.totalGb.toFixed(0)} GB`, `${spec.ram.stickCount} stick${spec.ram.stickCount === 1 ? '' : 's'}`]
  const reported = spec.ram.speedMts ?? null
  const configured = spec.ram.configuredSpeedMts ?? null
  if (reported && configured && reported !== configured) {
    parts.push(`${configured} MT/s configured · ${reported} MT/s reported`)
  } else if (configured || reported) {
    parts.push(`${configured ?? reported} MT/s configured`)
  }
  if (spec.ram.partNumber) parts.push(spec.ram.partNumber)
  return parts.join(' · ')
}

export function summarizeRig(spec: SpecProfile): RigContextSummary {
  const cpu = clean(spec.cpu.marketing || spec.cpu.model, 'Unknown CPU')
  const gpu = clean(spec.gpu.model || spec.gpu.vendor, 'Unknown GPU')
  const board = [spec.mobo.manufacturer, spec.mobo.product].filter(Boolean).join(' ') || 'Unknown motherboard'
  const configured = spec.ram.configuredSpeedMts ?? null
  const reported = spec.ram.speedMts ?? null
  const notices: RigContextSummary['notices'] = []

  if (spec.os.build > 0 && spec.os.build < 22000) {
    notices.push({
      tone: 'warn',
      text: `This rig is on Windows 10 (${formatOs(spec)}). Windows-specific guidance is being ranked for this build; validate any move to a supported Windows 11 install with the same Fortnite scene before switching.`,
    })
  }

  if (reported && configured && configured < reported * 0.97) {
    notices.push({
      tone: 'warn',
      text: `Memory is configured below the reported module speed (${configured} vs ${reported} MT/s). Inspect the board's XMP/EXPO/DOCP profile and stability before chasing CPU tweaks; no BIOS timing or voltage is auto-written.`,
    })
  }

  if (spec.ram.totalGb < 16) {
    notices.push({
      tone: 'warn',
      text: 'Less than 16 GB RAM was detected. Capacity and background-process pressure come before extreme latency experiments.',
    })
  }

  if (spec.ram.stickCount === 1) {
    notices.push({
      tone: 'warn',
      text: 'One DIMM was detected. Confirm channel placement before tuning; a matched dual-channel kit can matter more than a CPU tweak.',
    })
  }

  notices.push({
    tone: 'info',
    text: `Recommendations below are for this detected ${cpu} + ${gpu} + ${spec.ram.totalGb.toFixed(0)} GB rig. A separate i9-14900KF machine must be scanned separately; reference hardware is never substituted for this snapshot.`,
  })

  return {
    cpu,
    gpu,
    memory: formatMemory(spec),
    os: formatOs(spec),
    board,
    captured: new Date(spec.capturedAt).toLocaleString(),
    notices,
}
}
