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
    "$active=0; foreach($k in Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'){ $p=Get-ItemProperty -Path $k.PsPath -ErrorAction SilentlyContinue; $ips=@($p.IPAddress)+@($p.DhcpIPAddress); $hasIp=@($ips | Where-Object { $_ -and $_ -ne '0.0.0.0' }).Count -gt 0; if($hasIp){$active++; if($p.TcpAckFrequency -ne 1 -or $p.TCPNoDelay -ne 1){exit 1}} }; if($active -gt 0){exit 0}; exit 1",
  'network.qos.dscp-tag':
    "$names=@('optmaxxing-fortnite','optmaxxing-cs2','optmaxxing-valorant','optmaxxing-apex'); $p=@(Get-NetQosPolicy -ErrorAction Stop); foreach($n in $names){$x=$p | Where-Object Name -eq $n; if(-not $x -or [int]$x.DSCPAction -ne 46){exit 1}}; exit 0",
  'ps.mmagent.disable-mc':
    "if((Get-MMAgent -ErrorAction Stop).MemoryCompression -eq $false){exit 0}; exit 1",
  'ps.mmagent.disable-pagecombining':
    "if((Get-MMAgent -ErrorAction Stop).PageCombining -eq $false){exit 0}; exit 1",
  'ps.power.dt-tournament':
    "if((powercfg /getactivescheme | Out-String) -match 'DT Tournament'){exit 0}; exit 1",
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
