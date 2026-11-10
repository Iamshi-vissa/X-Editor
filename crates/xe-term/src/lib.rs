//! Real pseudo-terminal sessions (ConPTY on Windows, openpty elsewhere), so shells get
//! colours, prompts, Ctrl+C, line editing and full-screen programs like vim or htop.

use parking_lot::Mutex;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, thiserror::Error)]
pub enum TermError {
    #[error("terminal {0} not found")]
    NotFound(String),
    #[error("{0}")]
    Pty(String),
}

impl serde::Serialize for TermError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub program: String,
    pub args: Vec<String>,
    /// "posix", "powershell" or "cmd": tells callers how to quote and chain commands.
    pub kind: String,
}

/// Picks the user's shell: $SHELL on macOS/Linux, PowerShell 7 or Windows PowerShell on Windows.
pub fn default_shell() -> ShellInfo {
    if cfg!(windows) {
        if let Ok(p) = which::which("pwsh.exe") {
            return ShellInfo { program: p.to_string_lossy().into(), args: vec!["-NoLogo".into()], kind: "powershell".into() };
        }
        return ShellInfo { program: "powershell.exe".into(), args: vec!["-NoLogo".into()], kind: "powershell".into() };
    }
    let program = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| {
        if PathBuf::from("/bin/zsh").exists() && cfg!(target_os = "macos") { "/bin/zsh".into() } else { "/bin/bash".into() }
    });
    ShellInfo { program, args: vec!["-l".into()], kind: "posix".into() }
}

/// Classifies a shell program so the caller knows its command syntax.
pub fn shell_kind(program: &str) -> &'static str {
    let lower = program.to_lowercase();
    if lower.contains("pwsh") || lower.contains("powershell") {
        "powershell"
    } else if lower.ends_with("cmd.exe") || lower == "cmd" {
        "cmd"
    } else {
        "posix"
    }
}

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default, Clone)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

pub struct SpawnOptions {
    pub id: String,
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub cols: u16,
    pub rows: u16,
    pub env: Vec<(String, String)>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Starts a shell in a new PTY. `on_data` receives UTF-8 text (never split inside a
    /// character); `on_exit` gets the exit code once the shell ends.
    pub fn spawn<D, E>(&self, opts: SpawnOptions, on_data: D, on_exit: E) -> Result<(), TermError>
    where
        D: Fn(String) + Send + 'static,
        E: FnOnce(Option<u32>) + Send + 'static,
    {
        let pty = native_pty_system();
        let pair = pty
            .openpty(PtySize { rows: opts.rows.max(2), cols: opts.cols.max(2), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| TermError::Pty(e.to_string()))?;

        let mut cmd = CommandBuilder::new(&opts.program);
        cmd.args(&opts.args);
        cmd.cwd(&opts.cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "X-Editor");
        for (k, v) in &opts.env {
            cmd.env(k, v);
        }

        let mut child = pair.slave.spawn_command(cmd).map_err(|e| TermError::Pty(e.to_string()))?;
        drop(pair.slave);
        let killer = child.clone_killer();
        let mut reader = pair.master.try_clone_reader().map_err(|e| TermError::Pty(e.to_string()))?;
        let writer = pair.master.take_writer().map_err(|e| TermError::Pty(e.to_string()))?;

        self.sessions.lock().insert(opts.id.clone(), Session { writer, master: pair.master, killer });

        let sessions = self.sessions.clone();
        let id = opts.id.clone();
        std::thread::Builder::new()
            .name(format!("pty-{id}"))
            .spawn(move || {
                let mut buf = [0u8; 16 * 1024];
                let mut carry: Vec<u8> = Vec::new();
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            carry.extend_from_slice(&buf[..n]);
                            let text = take_utf8(&mut carry);
                            if !text.is_empty() {
                                on_data(text);
                            }
                        }
                    }
                }
                if !carry.is_empty() {
                    on_data(String::from_utf8_lossy(&carry).into_owned());
                }
                let code = child.wait().ok().map(|s| s.exit_code());
                sessions.lock().remove(&id);
                on_exit(code);
            })
            .map_err(|e| TermError::Pty(e.to_string()))?;
        Ok(())
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), TermError> {
        let mut map = self.sessions.lock();
        let s = map.get_mut(id).ok_or_else(|| TermError::NotFound(id.into()))?;
        s.writer.write_all(data.as_bytes()).map_err(|e| TermError::Pty(e.to_string()))?;
        s.writer.flush().map_err(|e| TermError::Pty(e.to_string()))
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), TermError> {
        let map = self.sessions.lock();
        let s = map.get(id).ok_or_else(|| TermError::NotFound(id.into()))?;
        s.master
            .resize(PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| TermError::Pty(e.to_string()))
    }

    pub fn kill(&self, id: &str) -> Result<(), TermError> {
        let mut map = self.sessions.lock();
        if let Some(mut s) = map.remove(id) {
            let _ = s.killer.kill();
        }
        Ok(())
    }

    pub fn kill_all(&self) {
        let mut map = self.sessions.lock();
        for (_, mut s) in map.drain() {
            let _ = s.killer.kill();
        }
    }
}

/// Returns the longest valid UTF-8 prefix of `buf` as a String and leaves an incomplete
/// trailing character (if any) in `buf` for the next read.
fn take_utf8(buf: &mut Vec<u8>) -> String {
    match std::str::from_utf8(buf) {
        Ok(s) => {
            let out = s.to_owned();
            buf.clear();
            out
        }
        Err(e) => {
            let valid = e.valid_up_to();
            if e.error_len().is_none() {
                // Incomplete sequence at the end: keep it for the next chunk.
                let out = String::from_utf8_lossy(&buf[..valid]).into_owned();
                buf.drain(..valid);
                out
            } else {
                let out = String::from_utf8_lossy(buf).into_owned();
                buf.clear();
                out
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn utf8_split_across_reads_is_preserved() {
        let bytes = "héllo".as_bytes().to_vec();
        let mut buf = bytes[..2].to_vec(); // 'h' + first byte of 'é'
        assert_eq!(take_utf8(&mut buf), "h");
        buf.extend_from_slice(&bytes[2..]);
        assert_eq!(take_utf8(&mut buf), "éllo");
    }

    #[cfg(unix)]
    #[test]
    fn runs_a_shell_command_in_a_pty() {
        let mgr = TerminalManager::new();
        let (tx, rx) = mpsc::channel::<String>();
        let (etx, erx) = mpsc::channel::<Option<u32>>();
        mgr.spawn(
            SpawnOptions {
                id: "t1".into(),
                program: "/bin/sh".into(),
                args: vec!["-c".into(), "test -t 1 && echo is-a-tty".into()],
                cwd: std::env::temp_dir(),
                cols: 80,
                rows: 24,
                env: vec![],
            },
            move |d| { let _ = tx.send(d); },
            move |c| { let _ = etx.send(c); },
        )
        .unwrap();
        assert_eq!(erx.recv_timeout(Duration::from_secs(10)).unwrap(), Some(0));
        let out: String = rx.try_iter().collect();
        assert!(out.contains("is-a-tty"), "output was {out:?}");
    }
}
