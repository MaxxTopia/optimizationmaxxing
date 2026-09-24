# clear_standby.ps1 - conditionally purge Windows standby memory list.
#
# Runs from a scheduled task (HighestAvailable run-level) every N minutes.
# Calls NtSetSystemInformation(SystemMemoryListInformation, MemoryPurgeStandbyList=4)
# via inline C# P/Invoke. RAMMap (Sysinternals) exposes the same purge operation.
# No driver, kernel hook, or game-process injection is used; do not promise that
# any third-party utility is universally compatible with every anti-cheat.
#
# Privilege: requires SeProfileSingleProcessPrivilege which is in the Admin token
# but DISABLED by default. We enable it explicitly via AdjustTokenPrivileges before
# the syscall. The scheduled task must be registered with HighestAvailable +
# RunAs SYSTEM (or elevated user) for this to succeed.
#
# ACTIVE-GAME-GUARD: v1
# Scheduled runs skip the purge while a supported game process is running.
# The script only checks process names; it does not open, modify, or inject into
# any game process. Unknown/custom games are not covered by this guard.
#
# Output: writes a single-line status to the optmaxxing local log so the
# Settings UI can show the last check and its result. Runs silently otherwise;
# failures are shown in Settings and are not automatically retried.

param(
    [string]$LogPath = "$env:LOCALAPPDATA\optmaxxing\standby-cleaner.log"
)

$ErrorActionPreference = 'SilentlyContinue'

# Make sure the log directory exists. First-run case.
$logDir = Split-Path -Parent $LogPath
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Log-Line($msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $LogPath -Value "$ts $msg"
    # Trim log to last 200 lines so it doesn't grow unbounded over weeks.
    try {
        $lines = Get-Content -LiteralPath $LogPath -Tail 200
        Set-Content -LiteralPath $LogPath -Value $lines
    } catch {}
}

# Standby pages are reclaimable cache, not memory that Windows must free for
# a game. Avoid flushing that cache during a known game session. This is a
# best-effort safeguard, not a guarantee against every possible source of
# background activity or a substitute for leaving the feature off by default.
$protectedGameProcesses = @(
    'FortniteClient-Win64-Shipping',
    'FortniteClient-Win64-Shipping_EAC',
    'FortniteClient-Win64-Shipping_BE',
    'VALORANT-Win64-Shipping',
    'cs2',
    'r5apex',
    'Marvel-Win64-Shipping',
    'Overwatch',
    'cod'
)

foreach ($processName in $protectedGameProcesses) {
    $running = Get-Process -Name $processName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $running) {
        Log-Line "SKIPPED active game: $($running.ProcessName)"
        exit 0
    }
}

# Inline C# - defines StandbyCleaner with EnablePrivilege + Purge static methods.
# Compile-once-per-process (Add-Type caches the type assembly).
$source = @'
using System;
using System.Runtime.InteropServices;

public class StandbyCleaner {
    [DllImport("ntdll.dll", SetLastError = true)]
    public static extern int NtSetSystemInformation(int infoClass, IntPtr info, int length);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out long lpLuid);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges, ref TOKEN_PRIVILEGES NewState, uint BufferLength, IntPtr PreviousState, IntPtr ReturnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct TOKEN_PRIVILEGES {
        public uint PrivilegeCount;
        public long Luid;
        public uint Attributes;
    }

    public const int SystemMemoryListInformation = 0x50;
    public const int MemoryPurgeStandbyList     = 4;
    public const uint TOKEN_ADJUST_PRIVILEGES   = 0x20;
    public const uint TOKEN_QUERY               = 0x08;
    public const uint SE_PRIVILEGE_ENABLED      = 0x02;

    public static bool EnablePrivilege(string privilegeName) {
        IntPtr hToken;
        if (!OpenProcessToken(System.Diagnostics.Process.GetCurrentProcess().Handle, TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out hToken)) {
            return false;
        }
        try {
            long luid;
            if (!LookupPrivilegeValue(null, privilegeName, out luid)) return false;
            var tp = new TOKEN_PRIVILEGES { PrivilegeCount = 1, Luid = luid, Attributes = SE_PRIVILEGE_ENABLED };
            return AdjustTokenPrivileges(hToken, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
        } finally {
            CloseHandle(hToken);
        }
    }

    public static int Purge() {
        int command = MemoryPurgeStandbyList;
        IntPtr ptr = Marshal.AllocHGlobal(sizeof(int));
        try {
            Marshal.WriteInt32(ptr, command);
            return NtSetSystemInformation(SystemMemoryListInformation, ptr, sizeof(int));
        } finally {
            Marshal.FreeHGlobal(ptr);
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $source -ErrorAction Stop
} catch {
    Log-Line "FAILED to Add-Type: $($_.Exception.Message)"
    exit 1
}

# Enable the privilege. Required even when running as Administrator - the privilege
# is in the token but DISABLED by default. Without this the syscall returns
# STATUS_PRIVILEGE_NOT_HELD (0xC0000061).
$privOk = [StandbyCleaner]::EnablePrivilege("SeProfileSingleProcessPrivilege")
if (-not $privOk) {
    Log-Line "FAILED to enable SeProfileSingleProcessPrivilege - task must run elevated"
    exit 2
}

$result = [StandbyCleaner]::Purge()
if ($result -eq 0) {
    Log-Line "OK purged standby list"
    exit 0
} else {
    $hex = '0x{0:X8}' -f $result
    Log-Line "FAILED NtSetSystemInformation returned $hex"
    exit 3
}
