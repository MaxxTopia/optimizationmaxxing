# LibreHardwareMonitor sensor reader.
#
# Loads LibreHardwareMonitorLib.dll (next to this script), opens every
# hardware bus (CPU, GPU, motherboard, storage, controller, network, RAM,
# psu, batteries) and emits a JSON document with per-component sensor
# readings.
#
# Drives both probe paths:
#   * Unelevated   — ACPI thermal zones, GPU sensors via vendor APIs (NVAPI/
#                    ADL through LHM), storage SMART (often). CPU package
#                    temp + per-core clocks usually NOT available.
#   * Elevated     — full sensor coverage including CPU package + per-core
#                    + voltage rails. Requires the WinRing0 kernel driver
#                    to load successfully.
#
# Output shape (when successful):
#   {
#     "ok": true,
#     "elevated": <bool>,
#     "lhm_version": "0.9.6",
#     "components": [
#       { "name": "Intel Core i7-...", "kind": "cpu",
#         "sensors": [ { "name":"CPU Package", "kind":"temperature",
#                        "value":42.0, "min":..., "max":... }, ... ] },
#       ...
#     ]
#   }
#
# Output shape on failure:
#   { "ok": false, "elevated": <bool>, "error": "..." }

param(
    [string]$DllPath = "$PSScriptRoot\LibreHardwareMonitorLib.dll"
)

$ErrorActionPreference = 'Stop'

function Emit-Error($msg) {
    $obj = [pscustomobject]@{
        ok       = $false
        elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        error    = "$msg"
    }
    $obj | ConvertTo-Json -Compress -Depth 6 | Write-Output
    exit 0
}

# Wrap a single statement and emit a precise error with the failing line +
# inner exception. Useful when LHM throws weird messages from inside its
# own hardware-enumeration code (e.g. the storage subsystem's "argument
# 'drive' is null" path on rigs with locked BitLocker volumes).
function Try-Step($label, [scriptblock]$body) {
    try { & $body }
    catch {
        $inner = $_.Exception.Message
        $pos   = $_.InvocationInfo.PositionMessage
        Emit-Error "$label : $inner :: $pos"
    }
}

if (-not $DllPath -or [string]::IsNullOrWhiteSpace($DllPath)) {
    Emit-Error "DllPath argument was empty or null"
}

if (-not (Test-Path -LiteralPath $DllPath)) {
    Emit-Error "LibreHardwareMonitorLib.dll not found at $DllPath"
}

Try-Step 'Unblock-DLLs' {
    Unblock-File -LiteralPath $DllPath -ErrorAction SilentlyContinue
    # NOTE: Split-Path on Windows can't parse `\\?\`-prefixed (extended-
    # length) paths returned by Tauri's resource_dir() — it errors out with
    # "Cannot process argument because the value of argument 'drive' is
    # null", killing the whole probe before LHM even loads. Use the .NET
    # Path API instead; it handles both regular and `\\?\` paths cleanly.
    $dllDir = [System.IO.Path]::GetDirectoryName($DllPath)
    if ($dllDir) {
        $hidPath = Join-Path $dllDir 'HidSharp.dll'
        if (Test-Path -LiteralPath $hidPath) {
            Unblock-File -LiteralPath $hidPath -ErrorAction SilentlyContinue
        }
    }
}

Try-Step 'Add-Type' {
    Add-Type -LiteralPath $DllPath
}

# Each subsystem enabled inside its own try so a single bad subsystem
# (Storage is the historic offender — see "argument 'drive' is null" issue
# on rigs with removable USB / locked BitLocker volumes / 8+ drives)
# doesn't kill the whole probe. Storage is OFF by default — we don't
# surface storage temps in the UI yet, and it's the most failure-prone
# path in LHM 0.9.6.
$computer = $null
Try-Step 'New-Computer' { $script:computer = New-Object LibreHardwareMonitor.Hardware.Computer }
Try-Step 'Enable-CPU'         { $script:computer.IsCpuEnabled         = $true }
Try-Step 'Enable-GPU'         { $script:computer.IsGpuEnabled         = $true }
Try-Step 'Enable-Memory'      { $script:computer.IsMemoryEnabled      = $true }
Try-Step 'Enable-Motherboard' { $script:computer.IsMotherboardEnabled = $true }
try { $computer.IsControllerEnabled = $true } catch {}
try { $computer.IsStorageEnabled    = $false } catch {}  # known-bad path on LHM 0.9.6
try { $computer.IsNetworkEnabled    = $true } catch {}
try { $computer.IsBatteryEnabled    = $true } catch {}
try { $computer.IsPsuEnabled        = $true } catch {}

Try-Step 'Computer.Open' { $script:computer.Open() }

# Update every component once so sensor values populate.
foreach ($hw in $computer.Hardware) {
    try { $hw.Update() } catch {}
    foreach ($sub in $hw.SubHardware) { try { $sub.Update() } catch {} }
}

# Map LHM's enum to lowercase string kinds.
function Sensor-Kind($s) {
    switch ($s.SensorType) {
        Voltage      { 'voltage' }
        Clock        { 'clock' }
        Temperature  { 'temperature' }
        Load         { 'load' }
        Frequency    { 'frequency' }
        Fan          { 'fan' }
        Flow         { 'flow' }
        Control      { 'control' }
        Level        { 'level' }
        Factor       { 'factor' }
        Power        { 'power' }
        Data         { 'data' }
        SmallData    { 'data_small' }
        Throughput   { 'throughput' }
        TimeSpan     { 'timespan' }
        Energy       { 'energy' }
        Noise        { 'noise' }
        Conductivity { 'conductivity' }
        Humidity     { 'humidity' }
        IntrusionDetection { 'intrusion' }
        AirFlow      { 'airflow' }
        default      { "$($s.SensorType)".ToLower() }
    }
}

function Hardware-Kind($h) {
    switch ($h.HardwareType) {
        Cpu                  { 'cpu' }
        GpuNvidia            { 'gpu_nvidia' }
        GpuAmd               { 'gpu_amd' }
        GpuIntel             { 'gpu_intel' }
        Motherboard          { 'motherboard' }
        SuperIO              { 'superio' }
        Memory               { 'memory' }
        Storage              { 'storage' }
        Network              { 'network' }
        Cooler               { 'cooler' }
        EmbeddedController   { 'embedded_controller' }
        Psu                  { 'psu' }
        Battery              { 'battery' }
        default              { "$($h.HardwareType)".ToLower() }
    }
}

function Collect-Sensors($hw) {
    $rows = @()
    foreach ($s in $hw.Sensors) {
        $val = $s.Value
        $valOut = $null
        if ($null -ne $val) { $valOut = [double]$val }
        $rows += [pscustomobject]@{
            name = $s.Name
            kind = Sensor-Kind $s
            value = $valOut
            min   = $s.Min
            max   = $s.Max
        }
    }
    foreach ($sub in $hw.SubHardware) {
        foreach ($s in $sub.Sensors) {
            $val = $s.Value
            $valOut = $null
            if ($null -ne $val) { $valOut = [double]$val }
            $rows += [pscustomobject]@{
                name = "$($sub.Name) / $($s.Name)"
                kind = Sensor-Kind $s
                value = $valOut
                min   = $s.Min
                max   = $s.Max
            }
        }
    }
    return ,$rows
}

$components = @()
foreach ($hw in $computer.Hardware) {
    $components += [pscustomobject]@{
        name    = $hw.Name
        kind    = Hardware-Kind $hw
        sensors = (Collect-Sensors $hw)
    }
}

$out = [pscustomobject]@{
    ok          = $true
    elevated    = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    lhm_version = '0.9.6'
    components  = $components
}

$computer.Close()

$out | ConvertTo-Json -Compress -Depth 6 | Write-Output
