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

if (-not (Test-Path $DllPath)) {
    Emit-Error "LibreHardwareMonitorLib.dll not found at $DllPath"
}

try {
    Unblock-File -LiteralPath $DllPath -ErrorAction SilentlyContinue
    $hidPath = Join-Path (Split-Path $DllPath) 'HidSharp.dll'
    if (Test-Path $hidPath) { Unblock-File -LiteralPath $hidPath -ErrorAction SilentlyContinue }
    Add-Type -LiteralPath $DllPath
} catch {
    Emit-Error "Could not load DLL: $($_.Exception.Message)"
}

try {
    $computer = New-Object LibreHardwareMonitor.Hardware.Computer
    $computer.IsCpuEnabled         = $true
    $computer.IsGpuEnabled         = $true
    $computer.IsMemoryEnabled      = $true
    $computer.IsMotherboardEnabled = $true
    $computer.IsControllerEnabled  = $true
    $computer.IsStorageEnabled     = $true
    $computer.IsNetworkEnabled     = $true
    $computer.IsBatteryEnabled     = $true
    $computer.IsPsuEnabled         = $true
    $computer.Open()
} catch {
    Emit-Error "Computer.Open failed: $($_.Exception.Message)"
}

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
