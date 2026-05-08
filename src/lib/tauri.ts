/**
 * Typed wrappers around #[tauri::command] handlers in src-tauri/src/lib.rs.
 * Frontend imports from here; do NOT call `invoke` directly elsewhere so we
 * have one place to evolve types as the engine matures.
 *
 * Browser-preview safe: when Tauri isn't present (running under `vite dev`
 * not `tauri dev`), every wrapper throws a clear NotInTauriError instead of
 * the cryptic "Cannot read properties of undefined (reading 'invoke')".
 */
import { invoke as rawInvoke } from '@tauri-apps/api/core'

export class NotInTauriError extends Error {
  constructor() {
    super(
      'Engine call attempted in browser preview. Install the optimizationmaxxing.exe shell to run this.',
    )
    this.name = 'NotInTauriError'
  }
}

export function inTauri(): boolean {
  // @ts-expect-error Tauri injects this at runtime
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri()) return Promise.reject(new NotInTauriError())
  return rawInvoke<T>(cmd, args)
}

// ---------- Spec types ----------

export interface CpuInfo {
  vendor: string
  model: string
  marketing: string
  family: number
  modelId: number
  cores: number
  logicalCores: number
  genOrZen: number | null
}

export interface GpuInfo {
  vendor: string
  model: string
  vramMb: number | null
  driverVersion: string | null
  arch: string | null
}

export interface RamInfo {
  totalGb: number
  stickCount: number
  speedMts: number | null
  configuredSpeedMts: number | null
  manufacturer: string | null
  partNumber: string | null
}

export interface OsInfo {
  edition: string
  caption: string
  displayVersion: string
  major: number
  minor: number
  build: number
  ubr: number | null
}

export interface MoboInfo {
  manufacturer: string | null
  product: string | null
  serialNumber: string | null
  biosVendor: string | null
  biosVersion: string | null
  biosReleaseDate: string | null
  biosSerial: string | null
  uuid: string | null
  isLaptop: boolean
}

export interface DiskDrive {
  model: string
  serial: string | null
  sizeGb: number
  interfaceType: string | null
  mediaType: string | null
  busKind: string
}

export interface StorageInfo {
  drives: DiskDrive[]
}

export interface SpecProfile {
  cpu: CpuInfo
  gpu: GpuInfo
  ram: RamInfo
  os: OsInfo
  mobo: MoboInfo
  storage: StorageInfo
  capturedAt: string
}

// ---------- Engine / tweak types ----------

export type Hive = 'hkcu' | 'hklm' | 'hkcr' | 'hku'

export type RegValueType =
  | 'dword'
  | 'qword'
  | 'string'
  | 'expand_string'
  | 'multi_string'
  | 'binary'

export type TweakAction =
  | {
      kind: 'registry_set'
      hive: Hive
      path: string
      name: string
      value_type: RegValueType
      value: number | string | string[] | number[]
    }
  | {
      kind: 'registry_delete'
      hive: Hive
      path: string
      name: string | null
    }
  | {
      kind: 'bcdedit_set'
      /** e.g. "useplatformclock", "hypervisorlaunchtype", "disabledynamictick" */
      name: string
      /** e.g. "no", "off", "yes", "enhanced" */
      value: string
    }
  | {
      kind: 'powershell_script'
      /** Vetted catalog-supplied script body. Always runs as Administrator. */
      apply: string
      /** Inverse script. null = non-revertible. */
      revert: string | null
    }
  | {
      kind: 'file_write'
      /** Absolute path. Supports %USERPROFILE% / %APPDATA% / %WINDIR% / etc. */
      path: string
      /** Base64-encoded file contents. */
      contents_b64: string
    }

export interface TweakPreview {
  kind: string
  requiresAdmin: boolean
  summary: string
  preState: unknown
}

export interface ApplyReceipt {
  receiptId: string
  tweakId: string
  appliedAt: string
  kind: string
}

export interface AppliedTweak {
  receiptId: string
  tweakId: string
  appliedAt: string
  status: string
  kind: string
}

export interface BootstrapPayload {
  catalogVersion: string
  appliedTweakIds: string[]
  spec: SpecProfile | null
}

// ---------- Calls ----------

export async function bootstrap(): Promise<BootstrapPayload> {
  return invoke<BootstrapPayload>('bootstrap')
}

export async function detectSpecs(refresh = false): Promise<SpecProfile> {
  return invoke<SpecProfile>('detect_specs', { refresh })
}

export async function previewTweak(action: TweakAction): Promise<TweakPreview> {
  return invoke<TweakPreview>('preview_tweak', { action })
}

export async function applyTweak(
  tweakId: string,
  action: TweakAction,
): Promise<ApplyReceipt> {
  return invoke<ApplyReceipt>('apply_tweak', { tweakId, action })
}

export interface BatchItem {
  tweakId: string
  action: TweakAction
}

/** Phase 4c-v1: ONE UAC prompt for the whole batch (HKCU items run unelevated in-process first). */
export async function applyBatch(items: BatchItem[]): Promise<ApplyReceipt[]> {
  return invoke<ApplyReceipt[]>('apply_batch', { items })
}

export async function revertTweak(receiptId: string): Promise<void> {
  return invoke('revert_tweak', { receiptId })
}

export interface RevertAllReport {
  reverted: number
  failedReceiptIds: string[]
  elevatedUsed: boolean
  totalActive: number
}

export async function revertAllApplied(): Promise<RevertAllReport> {
  return invoke<RevertAllReport>('revert_all_applied')
}

export async function listApplied(): Promise<AppliedTweak[]> {
  return invoke<AppliedTweak[]>('list_applied')
}

export interface PerfSnapshot {
  cpuPercent: number
  ramUsedGb: number
  ramTotalGb: number
  ramPercent: number
  uptimeSecs: number
}

export async function systemMetrics(): Promise<PerfSnapshot> {
  return invoke<PerfSnapshot>('system_metrics')
}

export interface ThermalReading {
  source: string
  celsius: number
}

export interface ThermalSnapshot {
  probes: ThermalReading[]
  disclaimer: string
}

export async function readTemps(): Promise<ThermalSnapshot> {
  return invoke<ThermalSnapshot>('read_temps')
}

export interface DiskFreeRow {
  driveLetter: string
  label: string | null
  sizeGb: number
  freeGb: number
  freePercent: number
}

export async function diskFree(): Promise<DiskFreeRow[]> {
  return invoke<DiskFreeRow[]>('disk_free')
}

export async function launchDiskCleanup(): Promise<void> {
  return invoke('launch_disk_cleanup')
}

export async function launchMemtest(): Promise<void> {
  return invoke('launch_memtest')
}

export interface DpcPerCpu {
  name: string
  dpcPercent: number
  interruptPercent: number
}

export interface DpcSnapshot {
  totalDpcPercent: number
  totalInterruptPercent: number
  perCpu: DpcPerCpu[]
  capturedAt: string
}

/** Reads DPC + interrupt-time percentages via WMI. ~50ms.
 *  Use this as a measurable before/after when applying tweaks: save a
 *  baseline, apply, re-snapshot, diff. Healthy gaming rig idle = <1-2%
 *  total DPC; >5% suggests a misbehaving driver. */
export async function dpcSnapshot(): Promise<DpcSnapshot> {
  return invoke<DpcSnapshot>('dpc_snapshot')
}

export interface PingResult {
  label: string
  target: string
  /** Avg/min/max in ms; null if all 4 packets failed. */
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
  /** Packets received out of 4. */
  received: number
}

export async function pingProbe(targets: Array<[string, string]>): Promise<PingResult[]> {
  return invoke<PingResult[]>('ping_probe', { targets })
}

export interface PcieLink {
  device: string
  /** Current link width as integer (8 = x8, 16 = x16). */
  currentWidth: number | null
  maxWidth: number | null
  /** Current link speed gen (1-6 mapping to Gen1-Gen6). */
  currentGen: number | null
  maxGen: number | null
}

/** Reads PCIe link width + speed for every Display-class PnP device.
 *  Used to surface "GPU running x8 instead of x16" — a common silent regression
 *  from the wrong slot, a loose card, or PCIe bifurcation misconfig.
 *  Note: at idle, link can drop to lower gen due to ASPM. Correlate with
 *  the PCIe-ASPM-off catalog tweak before flagging regressions. */
export async function pcieLinks(): Promise<PcieLink[]> {
  return invoke<PcieLink[]>('pcie_links')
}

export interface MicrocodeReport {
  cpuBrand: string
  /** Hex-formatted current microcode revision, e.g. "0x0000012B". */
  runningRevision: string | null
  isAffectedFamily: boolean
  minSafeRevision: string | null
  /** "ok" | "outdated" | "unknown" | "not-affected" */
  status: string
  note: string
}

/** Reads the running microcode revision from
 *  HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0\Update Revision and
 *  maps Intel 13/14gen affected models against the 0x12B mitigation floor. */
export async function microcodeReport(): Promise<MicrocodeReport> {
  return invoke<MicrocodeReport>('microcode_report')
}

export interface VbsReport {
  /** 0 = off, 1 = configured but not running, 2 = running. */
  vbsStatus: number
  hvciEnabled: boolean
  hypervisorLaunchtype: string | null
  /** "fully-disabled" | "partial" | "enabled" | "unknown" */
  status: string
  note: string
}

/** Reports on the trio: BCD hypervisorlaunchtype + HVCI registry +
 *  Win32_DeviceGuard runtime status. All three must say "off" for VBS to
 *  truly cost 0%. Anti-cheats may require VBS — surface a warning before
 *  flipping. */
export async function vbsReport(): Promise<VbsReport> {
  return invoke<VbsReport>('vbs_report')
}

export interface ProcessEntry {
  pid: number
  name: string
  ramMb: number
  /** "launcher" | "voice" | "music" | "browser" | "overlay" | "other" */
  category: string
}

export interface SuspendResult {
  pid: number
  ok: boolean
  error: string | null
}

/** Lists currently-running processes that match our curated list of "competing
 *  app" candidates: rival game launchers (Steam, Riot, Epic, EA, Battle.net,
 *  Galaxy, Ubisoft, Xbox, osu, etc.) plus voice (Discord), music (Spotify),
 *  and overlay/recorder processes. Empty array = nothing competing is running. */
export async function listSessionCandidates(): Promise<ProcessEntry[]> {
  return invoke<ProcessEntry[]>('list_session_candidates')
}

/** Suspends each PID (Windows process suspend — no CPU, no IO, but still in RAM).
 *  Per-PID results so the UI can flag protected/dead PIDs individually. */
export async function sessionSuspend(pids: number[]): Promise<SuspendResult[]> {
  return invoke<SuspendResult[]>('session_suspend', { pids })
}

export async function sessionResume(pids: number[]): Promise<SuspendResult[]> {
  return invoke<SuspendResult[]>('session_resume', { pids })
}
