/**
 * Read-only contracts for catalog PowerShell actions.
 *
 * These are deliberately kept outside the JSON catalog so a future catalog
 * refresh cannot silently make an arbitrary script eligible for Tune Now.
 * Only IDs listed here receive a verifier; every other PowerShell action stays
 * explicit-only and reports unknown rather than pretending it stuck.
 */

export const POWERSHELL_VERIFIERS: Record<string, string> = {
  'network.tcp.ack-nodelay':
    "$ErrorActionPreference='Stop'; $root='HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'; $paths=@(Get-ChildItem -LiteralPath $root -ErrorAction Stop | ForEach-Object { $p=Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue; $ips=@($p.IPAddress)+@($p.DhcpIPAddress); if(@($ips | Where-Object { $_ -and $_ -ne '0.0.0.0' -and $_ -ne '::' -and $_ -ne '127.0.0.1' -and $_ -ne '::1' }).Count -gt 0){ $_.PSPath } }); if($paths.Count -eq 0){exit 1}; foreach($path in $paths){ $p=Get-ItemProperty -LiteralPath $path -ErrorAction Stop; if([int]$p.TcpAckFrequency -ne 1 -or [int]$p.TCPNoDelay -ne 1){exit 1} }; exit 0",
  'network.qos.dscp-tag':
    "$names=@('optmaxxing-fortnite','optmaxxing-cs2','optmaxxing-valorant','optmaxxing-apex'); $p=@(Get-NetQosPolicy -ErrorAction Stop); foreach($n in $names){$x=$p | Where-Object Name -eq $n; if(-not $x -or [int]$x.DSCPAction -ne 46){exit 1}}; exit 0",
  'ps.mmagent.disable-mc':
    "if((Get-MMAgent -ErrorAction Stop).MemoryCompression -eq $false){exit 0}; exit 1",
  'ps.mmagent.disable-pagecombining':
    "if((Get-MMAgent -ErrorAction Stop).PageCombining -eq $false){exit 0}; exit 1",
  'ps.power.dt-tournament':
    "$ErrorActionPreference='Stop'; $statePath=Join-Path $env:LOCALAPPDATA 'optmaxxing\\backups\\siege-power-plan.json'; if(-not (Test-Path -LiteralPath $statePath)){Write-Output 'Power-plan ownership record is missing; verification is unknown.'; exit 2}; try{$state=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json}catch{Write-Output 'Power-plan ownership record cannot be read; verification is unknown.'; exit 2}; $schema=[int]$state.schema; $pattern='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; if($schema -notin @(1,2) -or $state.owner -ne 'optimizationmaxxing' -or $state.created -ne $true -or [string]$state.originalGuid -notmatch $pattern -or [string]$state.targetGuid -notmatch $pattern -or [string]$state.originalGuid -eq [string]$state.targetGuid){Write-Output 'Power-plan ownership record is invalid; verification is unknown.'; exit 2}; $planName='Optimizationmaxxing Ultimate Performance'; if($schema -eq 1){$planName='Optimizationmaxxing Siege'}elseif([string]$state.planName -ne $planName){Write-Output 'Power-plan name is invalid; verification is unknown.'; exit 2}; $target=[string]$state.targetGuid; $line=@(powercfg /list | Where-Object {$_ -match [regex]::Escape($target)}); if($line.Count -ne 1 -or $line[0] -notmatch ('\\('+[regex]::Escape($planName)+'\\)')){Write-Output 'Owned Ultimate Performance plan is missing or was renamed; verification is unknown.'; exit 2}; $active=powercfg /getactivescheme | Out-String; $activeGuid=[regex]::Match($active,'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}').Value; if(-not $activeGuid){Write-Output 'Active power plan could not be read; verification is unknown.'; exit 2}; if($activeGuid -ne $target){Write-Output 'MISMATCH: Active power-plan GUID differs from the owned Ultimate Performance plan.'; exit 1}; exit 0",
  'process.wake-timers.disable':
    "if((powercfg /query SCHEME_CURRENT SUB_SLEEP BD3B718A-0680-4D9D-8AB2-E1D2B4AC806D | Out-String) -match '0x00000000'){exit 0}; exit 1",
  'net.nic.interrupt-moderation.disable':
    "$found=0; foreach($a in @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')){$p=Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName 'Interrupt Moderation' -ErrorAction SilentlyContinue; if($p){$found++; if($p.DisplayValue -notmatch '^(Disabled|Off|No)$'){exit 1}}}; if($found -gt 0){exit 0}; exit 1",
  'net.nic.flow-control.disable':
    "$found=0; foreach($a in @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')){$p=Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName 'Flow Control' -ErrorAction SilentlyContinue; if($p){$found++; if($p.DisplayValue -notmatch '^(Disabled|Off|No)$'){exit 1}}}; if($found -gt 0){exit 0}; exit 1",
  'net.nic.rss.enable':
    "$found=0; foreach($a in @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')){$r=Get-NetAdapterRss -Name $a.Name -ErrorAction Stop; if(-not $r -or -not [bool]$r.Enabled){exit 1}; $found++}; if($found -gt 0){exit 0}; exit 1",
  'process.core-parking.disable':
    "$q=powercfg /query SCHEME_CURRENT SUB_PROCESSOR 0cc5b647-c1df-4637-891a-dec35c318583 | Out-String; if([regex]::Matches($q,'0x00000064').Count -ge 2){exit 0}; exit 1",
  'power.device-idle.performance':
    "$q=powercfg /query SCHEME_CURRENT SUB_NONE 4faab71a-92e5-4726-b531-224559672d19 | Out-String; if([regex]::Matches($q,'0x00000000').Count -ge 2){exit 0}; exit 1",
  'power.pcie.link-state.off':
    "$q=powercfg /query SCHEME_CURRENT SUB_PCIEXPRESS ee12f906-d277-404b-b6da-e5fa1a576df5 | Out-String; if([regex]::Matches($q,'0x00000000').Count -ge 2){exit 0}; exit 1",
  'power.usb3.link-power.disable':
    "$q=powercfg /query SCHEME_CURRENT SUB_USB 2a737441-1930-4402-8d77-b2bebba308a3 d4e23884-9b93-478a-9e23-77356611f124 | Out-String; if([regex]::Matches($q,'0x00000000').Count -ge 2){exit 0}; exit 1",
  'process.msi-mode.gpu-nic-audio':
    "$found=0; foreach($c in @('Display','Net','AudioEndpoint')){Get-PnpDevice -Class $c -PresentOnly -ErrorAction Stop | Where-Object {$_.Status -eq 'OK' -and $_.InstanceId -like 'PCI\\*'} | ForEach-Object {$found++; $p=\"HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\$($_.InstanceId)\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties\"; $v=(Get-ItemProperty -Path $p -Name MSISupported -ErrorAction Stop).MSISupported; if([int]$v -ne 1){exit 1}}}; if($found -gt 0){exit 0}; exit 1",
  'net.nic.rsc.disable':
    "$found=0; foreach($a in @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')){$r=Get-NetAdapterRsc -Name $a.Name -ErrorAction Stop; if($r){$found++; if($r.IPv4Enabled -or $r.IPv6Enabled){exit 1}}}; if($found -gt 0){exit 0}; exit 1",
  'net.nic.lso.disable':
    "$found=0; foreach($a in @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')){$r=Get-NetAdapterLso -Name $a.Name -ErrorAction Stop; if($r){$found++; if($r.IPv4Enabled -or $r.IPv6Enabled){exit 1}}}; if($found -gt 0){exit 0}; exit 1",
  'net.nic.eee-powersave.disable':
    "$names=@('Energy Efficient Ethernet','Energy-Efficient Ethernet','Green Ethernet','EEE','Advanced EEE','Power Saving Mode','Gigabit Lite','Ultra Low Power Mode'); $found=0; foreach($a in @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')){foreach($dn in $names){$p=Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName $dn -ErrorAction SilentlyContinue; if($p){$found++; if($p.DisplayValue -notmatch '^(Disabled|Off|No)$'){exit 1}}}; $pm=Get-NetAdapterPowerManagement -Name $a.Name -ErrorAction SilentlyContinue; if($pm -and $null -ne $pm.AllowComputerToTurnOffDevice){if($pm.AllowComputerToTurnOffDevice.ToString() -notmatch '^(Disabled|No)$'){exit 1}; $found++}}; if($found -gt 0){exit 0}; exit 1",
  'peripherals.rgb-control-apps.autostart-disable':
    "$kw=@('aura','icue','mystic light','synapse','g-hub','ghub','t-force','nzxt cam','steelseries gg','polychrome'); $runKeys=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'); foreach($p in $runKeys){if(Test-Path $p){$props=Get-ItemProperty -Path $p; foreach($n in $props.PSObject.Properties.Name){if($n -like 'PS*'){continue}; $hay=\"$n $($props.$n)\"; foreach($k in $kw){if($hay -like \"*$k*\"){exit 1}}}}}; try{foreach($t in Get-ScheduledTask -ErrorAction Stop){if([string]$t.State -eq 'Disabled'){continue}; $hay=\"$($t.TaskName) $($t.TaskPath)\"; foreach($k in $kw){if($hay -like \"*$k*\"){exit 1}}}}catch{}; exit 0",
}
