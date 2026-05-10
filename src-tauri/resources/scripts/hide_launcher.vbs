' optimizationmaxxing — silent PowerShell launcher for the standby cleaner
' scheduled task. Avoids the ~100-300ms console-window flash that happens
' when Task Scheduler launches powershell.exe directly with -WindowStyle
' Hidden (powershell can only hide AFTER the console paints). VBScript via
' Wscript is windowless from the start, so there's nothing to flash.
'
' Usage (set as the scheduled task's action):
'   wscript.exe "<path>\hide_launcher.vbs" "<path>\clear_standby.ps1"
'
' WScript.Arguments(0) is the .ps1 to run. Run() args:
'   args      — full command line
'   intWindowStyle = 0 = SW_HIDE
'   bWaitOnReturn  = False = fire-and-forget

If WScript.Arguments.Count < 1 Then
    WScript.Quit 2
End If
Dim psPath
psPath = WScript.Arguments(0)
Dim cmd
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psPath & """"
CreateObject("Wscript.Shell").Run cmd, 0, False
