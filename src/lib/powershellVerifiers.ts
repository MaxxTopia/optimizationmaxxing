/**
 * Read-only contracts for catalog PowerShell actions.
 *
 * These are deliberately kept outside the JSON catalog so a future catalog
 * refresh cannot silently make an arbitrary script eligible for Tune Now.
 * Only IDs listed here receive a verifier; every other PowerShell action stays
 * explicit-only and reports unknown rather than pretending it stuck.
 */

// Network verifiers must resolve the same physical adapter that carries the
// active IPv4 or IPv6 default route. Checking every adapter can report a
// false pass when a VPN, Hyper-V switch, or stale disconnected NIC is the one
// that was actually changed. IPv4-only lookup also made a valid IPv6-only or
// briefly-renumbering connection look like an apply failure.
const ACTIVE_PHYSICAL_ROUTE =
  "$ErrorActionPreference='Stop'; $routes=@(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' -and $_.InterfaceIndex }; Get-NetRoute -DestinationPrefix '::/0' -AddressFamily IPv6 -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -and $_.NextHop -ne '::' -and $_.InterfaceIndex }); $selected=$routes | Sort-Object @{Expression='RouteMetric';Ascending=$true},@{Expression='InterfaceMetric';Ascending=$true} | ForEach-Object { $candidate=Get-NetAdapter -Physical -InterfaceIndex ([int]$_.InterfaceIndex) -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | Select-Object -First 1; if($candidate){[pscustomobject]@{Route=$_;Adapter=$candidate}} } | Select-Object -First 1; if(-not $selected){Write-Output 'Active physical default route (IPv4 or IPv6) unavailable; verification is unknown.'; exit 2}; $route=$selected.Route; $a=$selected.Adapter; $idx=[int]$a.ifIndex; $guid=''; if($a.PSObject.Properties.Name -contains 'InterfaceGuid'){$guid=[string]$a.InterfaceGuid}; $pnp=''; if($a.PSObject.Properties.Name -contains 'PnpDeviceID'){$pnp=[string]$a.PnpDeviceID}; $identity=$pnp; if([string]::IsNullOrWhiteSpace($identity)){$identity=$guid}; if([string]::IsNullOrWhiteSpace($identity)){$identity=[string]$a.Name};"

// `powercfg /query` accepts a scheme and an optional subgroup, not a setting
// GUID as a third positional argument. Query the subgroup once, then isolate
// the requested setting block so another setting's AC/DC value cannot produce
// a false pass. Unsupported/hidden settings are a capability result, not an
// ambiguous failure that should roll back the rest of Asta.
const powerSettingVerifier = (subgroupGuid: string, settingGuid: string, label: string): string =>
  `$q=@(powercfg /query SCHEME_CURRENT ${subgroupGuid} 2>&1) -join [Environment]::NewLine; $exit=$LASTEXITCODE; if($exit -ne 0 -or [string]::IsNullOrWhiteSpace($q)){if($q -match '(?i)invalid parameters|not found|does not exist|unable to find'){Write-Output 'NOT_APPLICABLE: ${label} is not exposed by the active power plan.'; exit 2}; Write-Output 'UNKNOWN: Windows did not return the ${label} power setting.'; exit 2}; $block=[regex]::Match($q,'(?is)Power Setting GUID:\\s*${settingGuid}.*?(?=Power Setting GUID:|$)').Value; if([string]::IsNullOrWhiteSpace($block)){Write-Output 'NOT_APPLICABLE: ${label} is not exposed by the active power plan.'; exit 2}; $ac=[regex]::Match($block,'(?i)Current AC Power Setting Index:\\s+0x([0-9a-f]+)').Groups[1].Value; $dc=[regex]::Match($block,'(?i)Current DC Power Setting Index:\\s+0x([0-9a-f]+)').Groups[1].Value; if([string]::IsNullOrWhiteSpace($ac) -or [string]::IsNullOrWhiteSpace($dc)){Write-Output 'UNKNOWN: Windows returned the ${label} block without readable AC/DC values.'; exit 2}; $hasBattery=@(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).Count -gt 0; if($ac -eq '00000000' -and ((-not $hasBattery) -or $dc -eq '00000000')){exit 0}; if($hasBattery){Write-Output ('MISMATCH: ${label} is not disabled for both AC and DC (AC 0x'+$ac+', DC 0x'+$dc+').')}else{Write-Output ('MISMATCH: ${label} is not disabled for AC (AC 0x'+$ac+', DC 0x'+$dc+').')}; exit 1`

// Keep the generated PowerShell in ordinary string fragments so diagnostic
// text cannot accidentally turn a TypeScript interpolation into PowerShell
// syntax. This also makes the desktop AC-only rule explicit.
const hiddenPowerSettingVerifier = (
  subgroupGuid: string,
  settingGuid: string,
  label: string,
  expectedHex: string,
  targetDescription: string,
): string =>
  [
    "$q=@(powercfg /qh SCHEME_CURRENT " + subgroupGuid + " 2>&1) -join [Environment]::NewLine",
    "$exit=$LASTEXITCODE",
    "if($exit -ne 0 -or [string]::IsNullOrWhiteSpace($q)){if($q -match '(?i)invalid parameters|not found|does not exist|unable to find'){Write-Output 'NOT_APPLICABLE: " +
      label +
      " is not exposed by the active power plan.'; exit 2}; Write-Output 'UNKNOWN: Windows did not return the " +
      label +
      " power setting.'; exit 2}",
    "$block=[regex]::Match($q,'(?is)Power Setting GUID:[ ]*" +
      settingGuid +
      ".*?(?=Power Setting GUID:|$)').Value",
    "if([string]::IsNullOrWhiteSpace($block)){Write-Output 'NOT_APPLICABLE: " +
      label +
      " is not exposed by the active power plan.'; exit 2}",
    "$ac=[regex]::Match($block,'(?i)Current AC Power Setting Index:[ ]+0x([0-9a-f]+)').Groups[1].Value",
    "$dc=[regex]::Match($block,'(?i)Current DC Power Setting Index:[ ]+0x([0-9a-f]+)').Groups[1].Value",
    "if([string]::IsNullOrWhiteSpace($ac) -or [string]::IsNullOrWhiteSpace($dc)){Write-Output 'UNKNOWN: Windows returned the " +
      label +
      " block without readable AC/DC values.'; exit 2}",
    "$hasBattery=@(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).Count -gt 0",
    "if($ac -eq '" +
      expectedHex +
      "' -and ((-not $hasBattery) -or $dc -eq '" +
      expectedHex +
      "')){exit 0}",
    "if($hasBattery){Write-Output ('MISMATCH: " +
      label +
      " is not " +
      targetDescription +
      " for both AC and DC (AC 0x'+$ac+', DC 0x'+$dc+', target " +
      expectedHex +
      ").')}else{Write-Output ('MISMATCH: " +
      label +
      " is not " +
      targetDescription +
      " for AC (AC 0x'+$ac+', DC 0x'+$dc+', target " +
      expectedHex +
      ").')}; exit 1",
  ].join('; ')

const PCI_EXPRESS_SUBGROUP = '501a4d13-42af-4429-9fd1-a8218c268e20'
const PCI_EXPRESS_LINK_STATE = 'ee12f906-d277-404b-b6da-e5fa1a576df5'
const USB_SUBGROUP = '2a737441-1930-4402-8d77-b2bebba308a3'
const USB_LINK_POWER = 'd4e23884-9b93-478a-9e23-77356611f124'

const hostsMarkerVerifier = (
  startMarker: string,
  endMarker: string,
  hosts: string[],
  label: string,
): string => {
  const expected = hosts.map((host) => '0.0.0.0  ' + host)
  const expectedLiteral = '@(' + expected.map((line) => "'" + line + "'").join(',') + ')'
  return [
    "$ErrorActionPreference='Stop'",
    "$h=Join-Path $env:WINDIR 'System32\\drivers\\etc\\hosts'",
    "$start='" + startMarker + "'",
    "$end='" + endMarker + "'",
    "if(-not(Test-Path -LiteralPath $h)){Write-Output 'UNKNOWN: The Windows hosts file could not be read.'; exit 2}",
    "$content=Get-Content -LiteralPath $h -Raw -ErrorAction Stop",
    "$block=[regex]::Match($content,'(?ms)'+[regex]::Escape($start)+'.*?'+[regex]::Escape($end)).Value",
    "if([string]::IsNullOrWhiteSpace($block)){Write-Output ('MISMATCH: " + label + " hosts marker block is missing from the Windows hosts file.'); exit 1}",
    "$expected=" + expectedLiteral,
    "$missing=@($expected | Where-Object { $block -notmatch ('(?m)^\\s*'+[regex]::Escape($_)+'\\s*$') })",
    "if($missing.Count -gt 0){Write-Output ('MISMATCH: " + label + " hosts block is missing '+$missing.Count+' expected entry(s).'); exit 1}",
    "Write-Output 'Verified: " + label + " hosts marker block is present.'; exit 0",
  ].join('; ')
}

const hibernationDisabledVerifier =
  "$ErrorActionPreference='Stop'; $p=Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power' -Name HibernateEnabled -ErrorAction Stop; if([int]$p.HibernateEnabled -eq 0){Write-Output 'Verified: Hibernation is disabled.'; exit 0}; Write-Output ('MISMATCH: Hibernation is enabled (HibernateEnabled='+$p.HibernateEnabled+').'); exit 1"

const telemetryBatchTasks = [
  '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',
  '\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater',
  '\\Microsoft\\Windows\\Application Experience\\StartupAppTask',
  '\\Microsoft\\Windows\\Application Experience\\PcaPatchDbTask',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\KernelCeipTask',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip',
  '\\Microsoft\\Windows\\Autochk\\Proxy',
  '\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector',
  '\\Microsoft\\Windows\\Maps\\MapsToastTask',
  '\\Microsoft\\Windows\\Maps\\MapsUpdateTask',
  '\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient',
  '\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload',
  '\\Microsoft\\Windows\\Windows Error Reporting\\QueueReporting',
] as const

const scheduledTasksDisabledVerifier = (tasks: readonly string[]): string => {
  const taskLiteral = '@(' + tasks.map((task) => "'" + task + "'").join(',') + ')'
  return [
    "$ErrorActionPreference='Stop'",
    "$tasks=" + taskLiteral,
    "$missing=@(); $enabled=@()",
    "foreach($p in $tasks){$parts=$p -split '\\\\'; $tn=$parts[-1]; $tp=$p.Substring(0,$p.Length-$tn.Length); try{$task=Get-ScheduledTask -TaskPath $tp -TaskName $tn -ErrorAction Stop}catch{$missing += $p; continue}; if([string]$task.State -eq 'Disabled'){continue}; $enabled += $p}",
    "if($missing.Count -gt 0){Write-Output ('UNKNOWN: '+$missing.Count+' telemetry task(s) could not be read or are not installed.'); exit 2}",
    "if($enabled.Count -gt 0){Write-Output ('MISMATCH: '+$enabled.Count+' telemetry task(s) remain enabled.'); exit 1}",
    "Write-Output 'Verified: All cataloged telemetry tasks are disabled.'; exit 0",
  ].join('; ')
}

// These actions intentionally stay in the explicit-review lane. They either
// record guidance rather than changing a Windows setting, or create an
// artifact that requires a separate vendor UI to import. A generic "script
// ran" message would make those actions look verified when they are not.
export const POWERSHELL_MANUAL_VERIFICATION_NOTES: Record<string, string> = {
  'audio.sample-rate.match':
    'UNKNOWN: This action records audio guidance only; it does not change the endpoint format. Set the playback device to 24 bit, 48000 Hz in Windows Sound settings and verify it there.',
  'nvidia.nvpi.fortnite-profile':
    'UNKNOWN: The Fortnite .nip artifact can be generated, but NVIDIA Profile Inspector import and Apply are manual and cannot be verified by this app.',
}

export function manualPowerShellVerificationNote(tweakId: string): string | undefined {
  return POWERSHELL_MANUAL_VERIFICATION_NOTES[tweakId]
}

export const POWERSHELL_VERIFIERS: Record<string, string> = {
  'network.tcp.ack-nodelay':
    "$ErrorActionPreference='Stop'; $root='HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'; $paths=@(Get-ChildItem -LiteralPath $root -ErrorAction Stop | ForEach-Object { $p=Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue; $ips=@($p.IPAddress)+@($p.DhcpIPAddress); if(@($ips | Where-Object { $_ -and $_ -ne '0.0.0.0' -and $_ -ne '::' -and $_ -ne '127.0.0.1' -and $_ -ne '::1' }).Count -gt 0){ $_.PSPath } }); if($paths.Count -eq 0){Write-Output 'UNKNOWN: No IP-bound TCP/IP interface profile was found; Windows did not expose a safe target.'; exit 2}; $bad=@($paths | Where-Object { $p=Get-ItemProperty -LiteralPath $_ -ErrorAction Stop; [int]$p.TcpAckFrequency -ne 1 -or [int]$p.TCPNoDelay -ne 1 }); if($bad.Count -gt 0){Write-Output ('MISMATCH: TCP immediate-ACK/Nagle target is missing on '+$bad.Count+' IP-bound interface profile(s).'); exit 1}; exit 0",
  'network.qos.dscp-tag':
    "$ErrorActionPreference='Stop'; $path='FortniteClient-Win64-Shipping.exe'; $localRules=@(Get-NetQosPolicy -PolicyStore localhost -ErrorAction Stop); $activeRules=@(Get-NetQosPolicy -PolicyStore ActiveStore -ErrorAction Stop); $localFortnite=@($localRules | Where-Object { (($_.AppPathNameMatchCondition).Trim([char]34)) -like ('*' + $path) }); $activeFortnite=@($activeRules | Where-Object { (($_.AppPathNameMatchCondition).Trim([char]34)) -like ('*' + $path) }); if($activeFortnite.Count -eq 0){if($localFortnite.Count -eq 0){Write-Output 'MISMATCH: No Fortnite QoS policy is stored locally or effective in ActiveStore.'; exit 1}; $found=($localFortnite | ForEach-Object { \"$($_.Name): DSCP $($_.DSCPAction), Owner=$($_.Owner)\" }) -join '; '; Write-Output \"UNKNOWN: Fortnite QoS is stored locally but not present in ActiveStore, so Windows does not report it as effective. Found: $found. Review the policy source/profile before retrying.\"; exit 2}; $conflicts=@($activeFortnite | Where-Object { [int]$_.DSCPAction -ne 46 }); $found=($activeFortnite | ForEach-Object { \"$($_.Name): AppPath=$($_.AppPathNameMatchCondition), DSCP=$($_.DSCPAction), Owner=$($_.Owner)\" }) -join '; '; if($conflicts.Count -gt 0){Write-Output \"MISMATCH: Effective Fortnite QoS policy action is not DSCP 46. Found: $found\"; exit 1}; Write-Output \"Verified effective Fortnite QoS target (DSCP 46): $found\"",
  'ps.mmagent.disable-mc':
    "$ErrorActionPreference='Stop'; $m=Get-MMAgent -ErrorAction Stop; if($null -eq $m.MemoryCompression){Write-Output 'UNKNOWN: Windows did not expose the MemoryCompression state.'; exit 2}; if(-not [bool]$m.MemoryCompression){exit 0}; Write-Output 'MISMATCH: Memory Compression is still enabled.'; exit 1",
  'ps.mmagent.disable-pagecombining':
    "$ErrorActionPreference='Stop'; $m=Get-MMAgent -ErrorAction Stop; if($null -eq $m.PageCombining){Write-Output 'UNKNOWN: Windows did not expose the PageCombining state.'; exit 2}; if(-not [bool]$m.PageCombining){exit 0}; Write-Output 'MISMATCH: Page Combining is still enabled.'; exit 1",
  'ps.power.dt-tournament':
    "$ErrorActionPreference='Stop'; $statePath=Join-Path $env:LOCALAPPDATA 'optmaxxing\\backups\\siege-power-plan.json'; $planName='Optimizationmaxxing Ultimate Performance'; $legacyPlanName='Optimizationmaxxing Siege'; $active=powercfg /getactivescheme | Out-String; $activeGuid=[regex]::Match($active,'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}').Value; if(-not $activeGuid){Write-Output 'UNKNOWN: Active power plan could not be read; run the installed app as Administrator and retry.'; exit 2}; if(-not (Test-Path -LiteralPath $statePath)){ $plans=@(powercfg /list); $ownedPlan=@($plans | Where-Object {$_ -match ('\\('+[regex]::Escape($planName)+'\\)') -or $_ -match ('\\('+[regex]::Escape($legacyPlanName)+'\\)')}); if($ownedPlan.Count -gt 0){Write-Output 'UNKNOWN: An app-owned Ultimate Performance plan exists but its recovery record is missing; use Settings -> Restore/repair before retrying.'; exit 2}; Write-Output 'NOT_CONFIGURED: No app-owned Ultimate Performance plan or recovery record exists; first apply will create both before activation.'; exit 2}; try{$state=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json}catch{Write-Output 'UNKNOWN: Power-plan recovery data cannot be read; use Settings -> Restore/repair before retrying.'; exit 2}; $schema=[int]$state.schema; $pattern='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; if($schema -notin @(1,2) -or $state.owner -ne 'optimizationmaxxing' -or $state.created -ne $true -or [string]$state.originalGuid -notmatch $pattern -or [string]$state.targetGuid -notmatch $pattern -or [string]$state.originalGuid -eq [string]$state.targetGuid){Write-Output 'UNKNOWN: Power-plan ownership record is invalid; use Settings -> Restore/repair before retrying.'; exit 2}; if($schema -eq 1){$planName=$legacyPlanName}elseif([string]$state.planName -ne $planName){Write-Output 'UNKNOWN: Power-plan name is invalid; use Settings -> Restore/repair before retrying.'; exit 2}; $target=[string]$state.targetGuid; $line=@(powercfg /list | Where-Object {$_ -match [regex]::Escape($target)}); if($line.Count -ne 1 -or $line[0] -notmatch ('\\('+[regex]::Escape($planName)+'\\)')){Write-Output 'UNKNOWN: Owned Ultimate Performance plan is missing or was renamed; use Settings -> Restore/repair before retrying.'; exit 2}; if($activeGuid -ne $target){Write-Output 'MISMATCH: Active power-plan GUID differs from the owned Ultimate Performance plan.'; exit 1}; exit 0",
  'process.wake-timers.disable':
    "$q=powercfg /query SCHEME_CURRENT SUB_SLEEP BD3B718A-0680-4D9D-8AB2-E1D2B4AC806D | Out-String; if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($q)){Write-Output 'UNKNOWN: Windows did not return the wake-timer power setting.'; exit 2}; if($q -match '0x00000000'){exit 0}; Write-Output 'MISMATCH: Wake timers are not disabled in the active power plan.'; exit 1",
  'hosts.block.ms-telemetry': hostsMarkerVerifier(
    '# === optimizationmaxxing/ms-telemetry begin ===',
    '# === optimizationmaxxing/ms-telemetry end ===',
    [
      'vortex.data.microsoft.com',
      'vortex-win.data.microsoft.com',
      'telemetry.microsoft.com',
      'watson.telemetry.microsoft.com',
      'wes.df.telemetry.microsoft.com',
      'services.wes.df.telemetry.microsoft.com',
      'statsfe2.ws.microsoft.com',
      'sqm.df.telemetry.microsoft.com',
      'sqm.telemetry.microsoft.com',
      'v10.events.data.microsoft.com',
      'v20.events.data.microsoft.com',
      'settings-win.data.microsoft.com',
      'oca.telemetry.microsoft.com',
      'reports.wes.df.telemetry.microsoft.com',
      'feedback.windows.com',
    ],
    'Microsoft telemetry',
  ),
  'hosts.block.windows-ads': hostsMarkerVerifier(
    '# === optimizationmaxxing/windows-ads begin ===',
    '# === optimizationmaxxing/windows-ads end ===',
    [
      'arc.msn.com',
      'g.msn.com',
      'cdn.atdmt.com',
      'm.adnxs.com',
      'ads.msn.com',
      'ads1.msn.com',
      'rad.msn.com',
      'live.rads.msn.com',
      'msnbot-65-55-108-23.search.msn.com',
      'flex.msn.com',
    ],
    'Windows ads',
  ),
  'ps.hibernation.disable': hibernationDisabledVerifier,
  'tasks.telemetry-batch.disable': scheduledTasksDisabledVerifier(telemetryBatchTasks),
  'net.nic.interrupt-moderation.disable':
    `${ACTIVE_PHYSICAL_ROUTE}$p=Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName 'Interrupt Moderation' -ErrorAction SilentlyContinue; if(-not $p){Write-Output 'NOT_APPLICABLE: Interrupt Moderation is not exposed by the active adapter.'; exit 2}; if($p.DisplayValue -notmatch '^(Disabled|Off|No)$'){Write-Output ('MISMATCH: Interrupt Moderation is '+$p.DisplayValue+' on the active adapter; target is Disabled.'); exit 1}; exit 0`,
  'net.nic.flow-control.disable':
    `${ACTIVE_PHYSICAL_ROUTE}$p=Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName 'Flow Control' -ErrorAction SilentlyContinue; if(-not $p){Write-Output 'NOT_APPLICABLE: Flow Control is not exposed by the active adapter.'; exit 2}; if($p.DisplayValue -notmatch '^(Disabled|Off|No)$'){Write-Output ('MISMATCH: Flow Control is '+$p.DisplayValue+' on the active adapter; target is Disabled.'); exit 1}; exit 0`,
  'net.nic.rss.enable':
    `${ACTIVE_PHYSICAL_ROUTE}$f=Join-Path $env:LOCALAPPDATA 'optmaxxing\\backups\\nic-rss-stash.json'; $r=Get-NetAdapterRss -Name $a.Name -ErrorAction SilentlyContinue; if(-not $r){Write-Output 'NOT_APPLICABLE: RSS is not exposed by the active adapter.'; exit 2}; if(-not (Test-Path -LiteralPath $f)){Write-Output 'NOT_CONFIGURED: RSS recovery record is absent; first apply will save the current RSS state for this adapter before enabling it.'; exit 2}; try{$state=Get-Content -LiteralPath $f -Raw | ConvertFrom-Json}catch{Write-Output 'UNKNOWN: RSS ownership record cannot be read; use Settings -> Restore/repair before retrying.'; exit 2}; if([int]$state.schema -ne 2 -or [string]$state.owner -ne 'optimizationmaxxing' -or [string]$state.identity -ne $identity -or [int]$state.interfaceIndex -ne $idx){Write-Output 'UNKNOWN: RSS ownership record does not match the active adapter; refusing to guess which device to restore.'; exit 2}; if(-not [bool]$r.Enabled){Write-Output 'MISMATCH: RSS is not enabled on the active adapter.'; exit 1}; exit 0`,
  'process.core-parking.disable':
    hiddenPowerSettingVerifier(
      'SUB_PROCESSOR',
      '0cc5b647-c1df-4637-891a-dec35c318583',
      'Core parking minimum active cores',
      '00000064',
      'set to 100% (core parking disabled)',
    ),
  'power.device-idle.performance':
    hiddenPowerSettingVerifier(
      'SUB_NONE',
      '4faab71a-92e5-4726-b531-224559672d19',
      'Device idle policy',
      '00000000',
      'set to Performance',
    ),
  'power.pcie.link-state.off':
    powerSettingVerifier(PCI_EXPRESS_SUBGROUP, PCI_EXPRESS_LINK_STATE, 'PCIe Link State Power Management'),
  'power.usb3.link-power.disable':
    powerSettingVerifier(USB_SUBGROUP, USB_LINK_POWER, 'USB link power management'),
  'process.msi-mode.gpu-nic-audio':
    "$found=0; $bad=0; $unreadable=0; foreach($c in @('Display','Net','AudioEndpoint')){try{$devices=Get-PnpDevice -Class $c -PresentOnly -ErrorAction Stop | Where-Object {$_.Status -eq 'OK' -and $_.InstanceId -like 'PCI\\*'}}catch{$unreadable++; continue}; foreach($d in $devices){$found++; $p=\"HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\$($d.InstanceId)\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties\"; try{$v=(Get-ItemProperty -Path $p -Name MSISupported -ErrorAction Stop).MSISupported; if([int]$v -ne 1){$bad++}}catch{$unreadable++}}}; if($found -eq 0 -or $unreadable -gt 0){Write-Output 'UNKNOWN: Windows could not read MSI support for every present PCI display, network, or audio endpoint.'; exit 2}; if($bad -gt 0){Write-Output ('MISMATCH: '+$bad+' present PCI device(s) do not have MSI enabled.'); exit 1}; exit 0",
  'net.nic.rsc.disable':
    `${ACTIVE_PHYSICAL_ROUTE}$r=Get-NetAdapterRsc -Name $a.Name -ErrorAction SilentlyContinue; if(-not $r){Write-Output 'NOT_APPLICABLE: RSC is not exposed by the active adapter.'; exit 2}; if($r.IPv4Enabled -or $r.IPv6Enabled){Write-Output 'MISMATCH: Receive Segment Coalescing is still enabled on the active adapter.'; exit 1}; exit 0`,
  'net.nic.lso.disable':
    `${ACTIVE_PHYSICAL_ROUTE}$r=Get-NetAdapterLso -Name $a.Name -ErrorAction SilentlyContinue; if(-not $r){Write-Output 'NOT_APPLICABLE: LSO is not exposed by the active adapter.'; exit 2}; if($r.IPv4Enabled -or $r.IPv6Enabled){Write-Output 'MISMATCH: Large Send Offload is still enabled on the active adapter.'; exit 1}; exit 0`,
  'net.nic.eee-powersave.disable':
    `${ACTIVE_PHYSICAL_ROUTE}$names=@('Energy Efficient Ethernet','Energy-Efficient Ethernet','Green Ethernet','EEE','Advanced EEE','Power Saving Mode','Gigabit Lite','Ultra Low Power Mode'); $targets=@(); foreach($dn in $names){$p=Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName $dn -ErrorAction SilentlyContinue; if($p){$targets+=([pscustomobject]@{ kind='advanced'; displayName=$dn })}}; $pm=Get-NetAdapterPowerManagement -Name $a.Name -ErrorAction SilentlyContinue; if($pm -and $pm.PSObject.Properties.Name -contains 'AllowComputerToTurnOffDevice' -and [string]$pm.AllowComputerToTurnOffDevice -in @('Enabled','Disabled')){$targets+=([pscustomobject]@{ kind='power'; displayName='AllowComputerToTurnOffDevice' })}; if($targets.Count -eq 0){Write-Output 'NOT_APPLICABLE: The active adapter exposes no supported NIC power-saving properties.'; exit 2}; $f=Join-Path $env:LOCALAPPDATA 'optmaxxing\\backups\\nic-eee-stash.json'; if(-not (Test-Path -LiteralPath $f)){Write-Output 'NOT_CONFIGURED: NIC power-saving restore state is absent; first apply will capture the active adapter state.'; exit 2}; try{$state=Get-Content -LiteralPath $f -Raw | ConvertFrom-Json}catch{Write-Output 'UNKNOWN: NIC power ownership record cannot be read; use Settings -> Restore/repair before retrying.'; exit 2}; if([int]$state.schema -ne 2 -or [string]$state.owner -ne 'optimizationmaxxing' -or [string]$state.identity -ne $identity -or [int]$state.interfaceIndex -ne $idx){Write-Output 'UNKNOWN: NIC power ownership record does not match the active adapter; use Settings -> Restore/repair before retrying.'; exit 2}; $ownedTargets=@($state.targets); if($ownedTargets.Count -eq 0){Write-Output 'UNKNOWN: NIC power ownership record contains no restorable properties; use Settings -> Restore/repair before retrying.'; exit 2}; foreach($t in $ownedTargets){if([string]$t.kind -eq 'advanced'){$p=Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName ([string]$t.displayName) -ErrorAction SilentlyContinue; if(-not $p -or $p.DisplayValue -notmatch '^(Disabled|Off|No)$'){Write-Output ('MISMATCH: '+$t.displayName+' is not disabled on the active adapter.'); exit 1}}elseif([string]$t.kind -eq 'power'){$pm=Get-NetAdapterPowerManagement -Name $a.Name -ErrorAction SilentlyContinue; if(-not $pm -or $pm.AllowComputerToTurnOffDevice.ToString() -notmatch '^(Disabled|Off|No|False)$'){Write-Output 'MISMATCH: NIC power-down is not disabled on the active adapter.'; exit 1}}}; exit 0`,
  'peripherals.rgb-control-apps.autostart-disable':
    "$kw=@('aura','icue','mystic light','synapse','g-hub','ghub','t-force','nzxt cam','steelseries gg','polychrome'); $runKeys=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'); foreach($p in $runKeys){if(Test-Path $p){$props=Get-ItemProperty -Path $p; foreach($n in $props.PSObject.Properties.Name){if($n -like 'PS*'){continue}; $hay=\"$n $($props.$n)\"; foreach($k in $kw){if($hay -like \"*$k*\"){Write-Output ('MISMATCH: RGB control autostart remains enabled ('+$hay+').'); exit 1}}}}}; try{foreach($t in Get-ScheduledTask -ErrorAction Stop){if([string]$t.State -eq 'Disabled'){continue}; $hay=\"$($t.TaskName) $($t.TaskPath)\"; foreach($k in $kw){if($hay -like \"*$k*\"){Write-Output ('MISMATCH: RGB control scheduled task remains enabled ('+$hay+').'); exit 1}}}}catch{}; exit 0",
}
