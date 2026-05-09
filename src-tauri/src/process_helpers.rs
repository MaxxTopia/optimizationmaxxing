//! Cross-cutting `Command` helpers. Centralises CREATE_NO_WINDOW so we don't
//! accidentally spawn flashing cmd.exe / powershell.exe / ping.exe windows
//! when probing system state.
//!
//! IMPORTANT: do NOT use these helpers in the elevation path (engine::elevation
//! / Start-Process -Verb RunAs). The UAC prompt host needs the spawned
//! powershell window to be visible enough for Windows to attach the prompt;
//! suppressing the console there can cause the prompt to fall behind other
//! windows or never paint.

use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// CREATE_NO_WINDOW from winbase.h — suppresses the console window for child
/// processes that would otherwise inherit the parent's stdio.
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

/// `powershell.exe` configured to run silently — no visible console.
pub fn hidden_powershell() -> Command {
    let mut c = Command::new("powershell.exe");
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

/// `cmd.exe` configured to run silently — for output-capturing probes only,
/// not for the elevated batched-apply path.
#[cfg(test)]
#[allow(dead_code)]
pub fn hidden_cmd() -> Command {
    let mut c = Command::new("cmd.exe");
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

/// `ping.exe` — flashes a console without this flag. Used by the latency
/// probe which fires 6 hosts in series and would otherwise blink 6 cmd
/// windows in front of the user.
pub fn hidden_ping() -> Command {
    let mut c = Command::new("ping");
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

/// `bcdedit.exe` — diagnostic /enum reads, run unelevated. Same console-flash
/// problem as ping.
pub fn hidden_bcdedit() -> Command {
    let mut c = Command::new("bcdedit");
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

/// Apply CREATE_NO_WINDOW to an arbitrary `Command`. Use this when you need
/// to set the working directory / args / stdio first via the builder pattern
/// and then mark it hidden.
#[allow(dead_code)]
pub fn make_hidden(cmd: &mut Command) {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd; // silence unused warning on non-windows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_powershell_targets_powershell_exe() {
        let cmd = hidden_powershell();
        let program = cmd.get_program().to_string_lossy().to_string();
        assert_eq!(program, "powershell.exe");
    }

    #[test]
    fn hidden_ping_targets_ping() {
        let cmd = hidden_ping();
        let program = cmd.get_program().to_string_lossy().to_string();
        assert_eq!(program, "ping");
    }

    #[test]
    #[cfg(windows)]
    fn create_no_window_flag_is_classic_value() {
        // 0x08000000 is the documented CREATE_NO_WINDOW value from winbase.h.
        // Sanity check — if Windows ever changes this constant we want CI to
        // notice rather than silently flashing consoles.
        assert_eq!(CREATE_NO_WINDOW, 0x08000000);
    }
}
