; Tauri NSIS installer hooks for optimizationmaxxing.
;
; Why this exists: Windows aggressively caches the icon for a given .exe
; path and refuses to refresh it for hours/days even after the binary is
; replaced. Result: users install the new build and see a stale "OM"
; placeholder (or whatever icon was first cached) on their desktop /
; taskbar / Start Menu shortcut. Same problem hit Discordmaxxer; the fix
; there was the same pair of ie4uinit calls — copied here.
;
; ie4uinit.exe -ClearIconCache wipes the per-user IconCache.db; -show
; forces Explorer to rebuild it. Both are non-admin, ~instant.
; Wired in via tauri.conf.json -> bundle.windows.nsis.installerHooks.

!macro NSIS_HOOK_POSTINSTALL
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend
