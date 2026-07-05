# SPD reader -- identifies each DIMM's real DRAM manufacturer + die inputs by
# reading the SPD chip over the SMBus (via RAMSPDToolkit through the PawnIO
# driver LibreHardwareMonitor loads). This is the honest replacement for guessing
# the die from the module part number: the DRAM vendor (e.g. "Nanya", "SK Hynix")
# comes straight from SPD bytes, not the marketing name on the kit.
#
# Needs admin (SMBus is ring-0) + PawnIO installed -- the caller runs this
# elevated after ensuring PawnIO, same as the thermal probe.
#
# Output (stdout JSON):
#   { "ok": true, "busCount": N, "dimms": [ { slot, type, dramVendor,
#     moduleVendor, part, serial, capacityGb, spdRev, dieStepping }, ... ] }
# On failure: { "ok": false, "error": "..." }

param(
    [string]$LhmDir = "$PSScriptRoot"
)

$ErrorActionPreference = 'Stop'

function Emit-Error($msg) {
    [pscustomobject]@{ ok = $false; error = "$msg" } | ConvertTo-Json -Compress | Write-Output
    exit 0
}

try {
    $ramDll = Join-Path $LhmDir 'RAMSPDToolkit-NDD.dll'
    $lhmDll = Join-Path $LhmDir 'LibreHardwareMonitorLib.dll'
    if (-not (Test-Path -LiteralPath $ramDll)) { Emit-Error "RAMSPDToolkit-NDD.dll not found at $ramDll" }
    if (-not (Test-Path -LiteralPath $lhmDll)) { Emit-Error "LibreHardwareMonitorLib.dll not found at $lhmDll" }
    Unblock-File -LiteralPath $ramDll -ErrorAction SilentlyContinue
    Unblock-File -LiteralPath $lhmDll -ErrorAction SilentlyContinue
    Add-Type -LiteralPath $ramDll
    Add-Type -LiteralPath $lhmDll
} catch {
    Emit-Error "load DLLs: $($_.Exception.Message)"
}

# Let LibreHardwareMonitor stand up the PawnIO-backed RAMSPDToolkit driver and
# detect the SMBus controllers (shared static state RAMSPDToolkit then reads).
$computer = $null
try {
    $computer = New-Object LibreHardwareMonitor.Hardware.Computer
    $computer.IsMemoryEnabled = $true
    $computer.Open()
} catch {
    Emit-Error "open memory subsystem (PawnIO/SMBus): $($_.Exception.Message)"
}

$dimms = New-Object System.Collections.ArrayList
$busCount = 0
try {
    $buses = [RAMSPDToolkit.I2CSMBus.SMBusManager]::RegisteredSMBuses
    $busCount = $buses.Count
    $begin = [RAMSPDToolkit.SPD.Interop.Shared.SPDConstants]::SPD_BEGIN
    $end = [RAMSPDToolkit.SPD.Interop.Shared.SPDConstants]::SPD_END
    foreach ($bus in $buses) {
        for ($i = $begin; $i -le $end; $i++) {
            try {
                $det = New-Object RAMSPDToolkit.SPD.SPDDetector($bus, [byte]$i)
                if (-not $det.IsValid) { continue }
                $a = $det.Accessor
                $type = [string]$a.MemoryType()
                # DDR5 die-stepping byte (0x22A = 554) -- best-effort; not present
                # on DDR4 and manufacturer-optional on DDR5.
                $stepping = $null
                if ($type -match 'DDR5') {
                    try { $stepping = [int]$a.At([uint16]554) } catch { $stepping = $null }
                }
                [void]$dimms.Add([pscustomobject]@{
                    slot         = ('0x{0:X2}' -f [int]$i)
                    type         = $type
                    dramVendor   = $a.GetDRAMManufacturerString()
                    moduleVendor = $a.GetModuleManufacturerString()
                    part         = ($a.ModulePartNumber()).Trim()
                    serial       = $a.ModuleSerialNumber()
                    capacityGb   = [double]$a.GetCapacity()
                    spdRev       = ('0x{0:X2}' -f [int]$a.SPDRevision())
                    dieStepping  = $stepping
                })
            } catch { }
        }
    }
} catch {
    try { if ($computer) { $computer.Close() } } catch { }
    Emit-Error "enumerate SPD: $($_.Exception.Message)"
}

try { if ($computer) { $computer.Close() } } catch { }

[pscustomobject]@{ ok = $true; busCount = $busCount; dimms = $dimms } |
    ConvertTo-Json -Depth 5 -Compress | Write-Output
