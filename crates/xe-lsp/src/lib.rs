//! Runs language servers (rust-analyzer, typescript-language-server, pyright, clangd,
//! gopls, ...) over stdio and relays raw JSON-RPC messages to and from the UI, where
//! CodeMirror's LSP client speaks the protocol.

use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Arc;

#[derive(Debug, thiserror::Error)]
pub enum LspError {
    #[error("language server `{0}` isn't installed or not on PATH")]
    NotInstalled(String),
    #[error("language server {0} isn't running")]
    NotRunning(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
}

impl serde::Serialize for LspError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerAvailability {
    pub command: String,
    pub installed: bool,
}

pub fn is_installed(command: &str) -> bool {
    which::which(command).is_ok()
}

struct Server {
    stdin: ChildStdin,
    child: Child,
}

#[derive(Default, Clone)]
pub struct LspManager {
    servers: Arc<Mutex<HashMap<String, Server>>>,
}

impl LspManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Starts a server; `on_message` gets each JSON-RPC message body, `on_exit` fires when
    /// the server process ends. stderr is forwarded to `on_log`.
    #[allow(clippy::too_many_arguments)]
    pub fn start<M, L, E>(
        &self,
        id: String,
        command: &str,
        args: &[String],
        cwd: PathBuf,
        on_message: M,
        on_log: L,
        on_exit: E,
    ) -> Result<(), LspError>
    where
        M: Fn(String) + Send + 'static,
        L: Fn(String) + Send + 'static,
        E: FnOnce() + Send + 'static,
    {
        let program = which::which(command).map_err(|_| LspError::NotInstalled(command.to_string()))?;
        let mut cmd = Command::new(program);
        cmd.args(args).current_dir(cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = cmd.spawn()?;
        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");

        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                on_log(line);
            }
        });

        let servers = self.servers.clone();
        let sid = id.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            while let Some(msg) = read_message(&mut reader) {
                on_message(msg);
            }
            if let Some(mut s) = servers.lock().remove(&sid) {
                let _ = s.child.kill();
                let _ = s.child.wait();
            }
            on_exit();
        });

        self.servers.lock().insert(id, Server { stdin, child });
        Ok(())
    }

    pub fn send(&self, id: &str, message: &str) -> Result<(), LspError> {
        let mut map = self.servers.lock();
        let s = map.get_mut(id).ok_or_else(|| LspError::NotRunning(id.into()))?;
        write!(s.stdin, "Content-Length: {}\r\n\r\n{}", message.len(), message)?;
        s.stdin.flush()?;
        Ok(())
    }

    pub fn stop(&self, id: &str) {
        if let Some(mut s) = self.servers.lock().remove(id) {
            let _ = s.child.kill();
            let _ = s.child.wait();
        }
    }

    pub fn stop_all(&self) {
        let ids: Vec<String> = self.servers.lock().keys().cloned().collect();
        for id in ids {
            self.stop(&id);
        }
    }
}

/// Reads one `Content-Length`-framed message. Returns None at end of stream.
fn read_message<R: BufRead>(reader: &mut R) -> Option<String> {
    let mut length: Option<usize> = None;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).ok()? == 0 {
            return None;
        }
        let header = header.trim_end();
        if header.is_empty() {
            if length.is_some() {
                break;
            }
            continue;
        }
        if let Some(v) = header.strip_prefix("Content-Length:") {
            length = v.trim().parse().ok();
        }
    }
    let mut body = vec![0u8; length?];
    reader.read_exact(&mut body).ok()?;
    Some(String::from_utf8_lossy(&body).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_framed_messages() {
        let raw = "Content-Length: 2\r\nContent-Type: x\r\n\r\n{}Content-Length: 4\r\n\r\nnull";
        let mut r = std::io::Cursor::new(raw.as_bytes());
        assert_eq!(read_message(&mut r).as_deref(), Some("{}"));
        assert_eq!(read_message(&mut r).as_deref(), Some("null"));
        assert_eq!(read_message(&mut r), None);
    }
}
