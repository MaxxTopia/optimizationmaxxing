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

/**
 * Open a URL in the user's system browser. Inside Tauri, `window.open()` is
 * silently no-op'd by the webview unless the URL is allowlisted in
 * tauri.conf.json's CSP — so every external link in the app was visually
 * broken (click = nothing). Plugin-shell's `open()` goes through the OS
 * `ShellExecute`-equivalent path and works for any URL the user could open
 * by hand. In browser preview we fall back to `window.open` so /pricing
 * etc. still demo on maxxtopia.com.
 *
 * Capability `shell:allow-open` already in src-tauri/capabilities/default.json.
 */
export async function openExternal(url: string): Promise<void> {
  if (inTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
      return
    } catch (e) {
      console.warn('[openExternal] shell.open failed, falling back to window.open:', e)
    }
  }
  window.open(url, '_blank', 'noopener')
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

export interface BufferbloatReport {
  idlePingsMs: number[]
  loadedPingsMs: number[]
  idleP50Ms: number | null
  loadedP50Ms: number | null
  /** Loaded p50 minus idle p50, in ms. Higher = worse bufferbloat. */
  deltaMs: number | null
  /** Single-letter grade A/B/C/D/F (or "—" if probe failed). */
  grade: string
  bytesDownloaded: number
  error: string | null
}

export async function bufferbloatProbe(): Promise<BufferbloatReport> {
  return invoke<BufferbloatReport>('bufferbloat_probe')
}

export interface OnuStickReport {
  temperatureC: number | null
  voltageV: number | null
  biasCurrentMa: number | null
  txPowerDbm: number | null
  rxPowerDbm: number | null
  state: string | null
  firmware: string | null
  serial: string | null
  rawJson: string | null
  error: string | null
  fetchMs: number
}

export async function onuStickMetrics(url: string): Promise<OnuStickReport> {
  return invoke<OnuStickReport>('onu_stick_metrics', { url })
}

/**
 * v0.1.77 — auto-discovery. Tries the well-known XGS-PON stick management
 * URLs in parallel via PowerShell ForEach-Object -Parallel. First HTTP-200
 * wins. Returns { url } if found; { url: null } + per-attempt diagnostic
 * if nothing on the user's subnet matches a known stick.
 */
export interface OnuDiscoveryAttempt {
  url: string
  ok: boolean
  elapsedMs: number
  error: string | null
}
export interface OnuDiscoveryResult {
  /** Best-guess stick management URL — null if no candidate responded. */
  url: string | null
  elapsedMs: number
  candidatesTried: number
  attempts: OnuDiscoveryAttempt[]
}
export async function onuDiscoverStick(): Promise<OnuDiscoveryResult> {
  return invoke<OnuDiscoveryResult>('onu_discover_stick')
}

export interface ThermalReading {
  source: string
  celsius: number
}

export interface GpuSnapshot {
  vendor: string
  name: string
  temperatureC: number | null
  utilizationPct: number | null
  powerW: number | null
  clockMhz: number | null
  memoryClockMhz: number | null
  fanPct: number | null
  throttleReasons: string[]
}

export interface CpuClockSnapshot {
  baseMhz: number | null
  currentMhz: number | null
  currentPctOfMax: number | null
  belowMax: boolean
}

export interface LiveThermalsReport {
  capturedAtMs: number
  thermalZones: ThermalReading[]
  gpus: GpuSnapshot[]
  cpuClock: CpuClockSnapshot
  cpuThermalThrottleSuspected: boolean
  gpuThrottleActive: boolean
}

export async function liveThermals(): Promise<LiveThermalsReport> {
  return invoke<LiveThermalsReport>('live_thermals')
}

export interface LhmSensorReading {
  name: string
  kind: string
  value: number | null
  min: number | null
  max: number | null
}

export interface LhmComponent {
  name: string
  kind: string
  sensors: LhmSensorReading[]
}

export interface LhmReport {
  ok: boolean
  elevated: boolean
  lhmVersion: string | null
  components: LhmComponent[]
  error: string | null
}

export async function lhmSensors(): Promise<LhmReport> {
  return invoke<LhmReport>('lhm_sensors')
}

export async function lhmSensorsElevated(): Promise<LhmReport> {
  return invoke<LhmReport>('lhm_sensors_elevated')
}

export async function vipHwid(): Promise<string> {
  return invoke<string>('vip_hwid')
}

export async function vipVerify(code: string): Promise<boolean> {
  return invoke<boolean>('vip_verify', { code })
}

export interface VipClaimResult {
  ok: boolean
  /** 'claimed' / 'idempotent' / 'already-claimed' / 'network-error' / 'malformed' / 'not-found' / 'http-<code>' */
  status: string
  boundHwid: string | null
  error: string | null
}

export async function vipClaimOnline(code: string): Promise<VipClaimResult> {
  return invoke<VipClaimResult>('vip_claim_online', { code })
}

export interface CpuLatencySample {
  totalNs: number
  iterations: number
  nsPerIter: number
}

export interface PingJitterSample {
  samples: number[]
  p50Ms: number | null
  stddevMs: number | null
  host: string
}

export async function benchCpu(): Promise<CpuLatencySample> {
  return invoke<CpuLatencySample>('bench_cpu')
}

export async function benchPing(host: string, count: number): Promise<PingJitterSample> {
  return invoke<PingJitterSample>('bench_ping', { host, count })
}

export interface RecordingApp {
  name: string
  pid: number
  ramMb: number
}

export interface AuditState {
  recordingApps: RecordingApp[]
  gameDvrState: string
  windowsUpdateState: string
  searchIndexerState: string
}

export async function auditState(): Promise<AuditState> {
  return invoke<AuditState>('audit_state')
}

export interface RamModule {
  slot: string
  manufacturer: string
  partNumber: string
  capacityGb: number
  speedMts: number
  voltageMv: number | null
  formFactor: string
  icType: string
  icCharacter: string
}

export async function ramModules(): Promise<RamModule[]> {
  return invoke<RamModule[]>('ram_modules')
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
  /** "ok" | "outdated" | "unknown" | "not-affected" | "active-degradation" */
  status: string
  note: string
  /** WHEA-Logger event count in System log over last 30 days (null if not
   * queryable). >5 on affected family = active-degradation signal. */
  wheaEvents30d: number | null
}

/** Reads the running microcode revision from
 *  HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0\Update Revision and
 *  maps Intel 13/14gen affected models against the 0x12B mitigation floor. */
export async function microcodeReport(): Promise<MicrocodeReport> {
  return invoke<MicrocodeReport>('microcode_report')
}

export interface MonitorInfo {
  /** 3-letter EDID PNP vendor code, e.g. "GSM" for LG. */
  vendorCode: string
  vendorName: string
  model: string
  productCode: string
  serial: string
  manufactureYear: number | null
  manufactureWeek: number | null
  ageYears: number | null
  /** Vendor's firmware / support page URL. null = vendor not mapped. */
  firmwareUrl: string | null
  /** Name of the vendor's display firmware/control tool. null = vendor not mapped. */
  firmwareTool: string | null
}

export interface MonitorReport {
  monitors: MonitorInfo[]
  note: string
}

/** Reads EDID via WmiMonitorID, identifies vendor + model + manufacture
 *  date for each connected display. Maps PNP code → vendor name + firmware
 *  tool / support URL. Windows doesn't expose monitor firmware *version*
 *  through any standard API — this is articleware-with-detection. */
export async function monitorInventory(): Promise<MonitorReport> {
  return invoke<MonitorReport>('monitor_inventory')
}

export interface DriverEntry {
  classLabel: string
  deviceName: string
  vendor: string
  rawVersion: string
  /** User-facing version when we can derive it (NVIDIA today). null otherwise. */
  friendlyVersion: string | null
  /** ISO yyyy-mm-dd, null when WMI returned an unparseable date. */
  driverDate: string | null
  ageDays: number | null
  stale: boolean
  /** Short reason if this driver is on the bundled known-bad list. */
  knownBad: string | null
  knownGood: boolean
}

export interface DriverHealthReport {
  drivers: DriverEntry[]
  staleCount: number
  knownBadCount: number
  note: string
}

/** Walks Win32_PnPSignedDriver and flags stale / known-bad drivers per
 *  class (GPU / chipset / audio / network / storage). NVIDIA gets its
 *  user-facing version extracted from the WMI Microsoft-internal version. */
export async function driverHealth(): Promise<DriverHealthReport> {
  return invoke<DriverHealthReport>('driver_health')
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

// ---------- Crash log ----------

export interface CrashEntry {
  filename: string
  ts: string
  kind: string
  size_bytes: number
}

/** Lists the most-recent ≤20 crash logs from %LOCALAPPDATA%\optmaxxing\crashes\.
 *  Newest first. Empty array if dir is missing or empty. */
export async function crashList(): Promise<CrashEntry[]> {
  return invoke<CrashEntry[]>('crash_list')
}

/** Reads a single crash log by filename (path-traversal-rejected on the Rust side). */
export async function crashRead(filename: string): Promise<string> {
  return invoke<string>('crash_read', { filename })
}

/** Frontend → Rust crash-write. Called by the React error boundary when an
 *  exception escapes. Same on-disk format as Rust panics (different `kind`). */
export async function crashLogFrontend(message: string, stack?: string): Promise<void> {
  return invoke('crash_log_frontend', { message, stack: stack ?? null })
}

// ---------- Telemetry (anonymous opt-in) ----------

export interface TelemetrySettings {
  enabled: boolean
  /** Stable anonymous device id. Generated on first opt-in. */
  device_id: string | null
}

export async function telemetryGet(): Promise<TelemetrySettings> {
  return invoke<TelemetrySettings>('telemetry_get')
}

export async function telemetrySet(enabled: boolean): Promise<TelemetrySettings> {
  return invoke<TelemetrySettings>('telemetry_set', { enabled })
}

/** Fire-and-forget. Silent no-op when telemetry is disabled. Never blocks. */
export async function telemetrySendEvent(
  kind: 'tweak.applied' | 'preset.applied' | 'bench.composite' | 'app.launch',
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!inTauri()) return
  // Don't await — caller should not block on telemetry, ever.
  invoke('telemetry_send_event', { kind, payload }).catch(() => {})
}

// ---------- Background standby memory cleaner ----------

export interface StandbyStatus {
  /** True if the scheduled task exists. */
  installed: boolean
  /** Last time the task ran successfully (parsed from log file). */
  lastRun: string | null
  /** Last log line (status from the most recent purge). */
  lastStatus: string | null
  /** Path to the log file we read from. */
  logPath: string
}

export async function standbyStatus(): Promise<StandbyStatus> {
  return invoke<StandbyStatus>('standby_status')
}

export async function standbyInstall(intervalMinutes: number): Promise<StandbyStatus> {
  return invoke<StandbyStatus>('standby_install', { intervalMinutes })
}

export async function standbyUninstall(): Promise<StandbyStatus> {
  return invoke<StandbyStatus>('standby_uninstall')
}

export async function standbyRunNow(): Promise<StandbyStatus> {
  return invoke<StandbyStatus>('standby_run_now')
}

/**
 * v0.1.76 — migration check. Tasks installed by v0.1.63-v0.1.73 used a
 * direct `powershell.exe -WindowStyle Hidden` command, which causes a
 * console flash every interval. v0.1.74+ wraps the call in a wscript
 * launcher so there's no flash. This call surfaces whether the existing
 * task needs re-registering.
 *
 * Returns null if no task exists. Otherwise returns { outdated, currentIntervalMinutes }.
 */
export interface StandbyMigrationInfo {
  outdated: boolean
  currentIntervalMinutes: number
  taskToRun: string
}
export async function standbyCheckMigration(): Promise<StandbyMigrationInfo | null> {
  return invoke<StandbyMigrationInfo | null>('standby_check_migration')
}

// ---------- CPU Sets game pinning ----------

export interface CpuSetInfo {
  logicalProcessorCount: number
  cpuSetIds: number[]
  /** Hybrid Intel P-core logical IDs (12th+ gen). Empty on uniform CPUs. */
  pCoreIds: number[]
  /** Hybrid Intel E-core logical IDs. Empty on uniform CPUs. */
  eCoreIds: number[]
  /** True iff Windows reports >1 EfficiencyClass (Intel hybrid / SQ-X). */
  isHybrid: boolean
}

export interface PinReport {
  pid: number
  processName: string
  cores: number[]
  ok: boolean
  error: string | null
}

export async function cpuSetInfo(): Promise<CpuSetInfo> {
  return invoke<CpuSetInfo>('cpu_set_info')
}

export async function cpuPinForeground(cores: number[]): Promise<PinReport> {
  return invoke<PinReport>('cpu_pin_foreground', { cores })
}

export async function cpuPinPid(pid: number, cores: number[]): Promise<PinReport> {
  return invoke<PinReport>('cpu_pin_pid', { pid, cores })
}

export async function cpuClearPin(pid: number): Promise<PinReport> {
  return invoke<PinReport>('cpu_clear_pin', { pid })
}

// ---------- Auto-pin daemon ----------

export interface AutoPinRule {
  processName: string
  cores: number[]
}

export interface AutoPinConfig {
  enabled: boolean
  pollSeconds: number
  rules: AutoPinRule[]
}

export interface AutoPinPinnedProc {
  pid: number
  processName: string
  cores: number[]
  pinnedAt: string
}

export interface AutoPinStatus {
  running: boolean
  lastPoll: string | null
  pinned: AutoPinPinnedProc[]
  config: AutoPinConfig
}

export async function autoPinStatus(): Promise<AutoPinStatus> {
  return invoke<AutoPinStatus>('auto_pin_status')
}

export async function autoPinGetConfig(): Promise<AutoPinConfig> {
  return invoke<AutoPinConfig>('auto_pin_get_config')
}

export async function autoPinSetConfig(config: AutoPinConfig): Promise<AutoPinConfig> {
  return invoke<AutoPinConfig>('auto_pin_set_config', { config })
}
