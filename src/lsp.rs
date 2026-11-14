//! A Language Server Protocol client.
//!
//! Each language gets one server process, started the first time a buffer of
//! that language is synced. Messages are JSON-RPC framed with a
//! `Content-Length` header over the server's stdin and stdout. A reader
//! thread per server parses incoming messages and hands them to the editor
//! through a channel, so the UI thread never blocks on a server.
//!
//! Documents are synced in full on every change, and positions use UTF-16
//! columns, which every server must support.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, TryRecvError};

use serde_json::{json, Value};

use crate::editor::absolute;

#[derive(Debug, Clone, PartialEq)]
pub struct Diagnostic {
    /// Start and end as (line, UTF-16 column).
    pub start: (usize, usize),
    pub end: (usize, usize),
    /// 1 is an error, 2 a warning, 3 information, 4 a hint.
    pub severity: u64,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompletionItem {
    pub label: String,
    /// The text to insert in place of the word being completed.
    pub insert: String,
    pub detail: String,
}

#[derive(Debug, PartialEq)]
pub enum Event {
    /// Something on screen changed (new diagnostics).
    Redraw,
    Status(String),
    Hover(String),
    /// Target file, line and UTF-16 column; `None` if the server found nothing.
    Definition(Option<(PathBuf, usize, usize)>),
    /// `revision` is the buffer revision the request was made at.
    Completion {
        revision: u64,
        items: Vec<CompletionItem>,
    },
}

enum Kind {
    Initialize,
    Definition,
    Hover,
    Completion(u64),
}

struct Client {
    child: Child,
    stdin: ChildStdin,
    incoming: Receiver<Value>,
    next_id: u64,
    pending: HashMap<u64, Kind>,
    /// Until the server answers `initialize`, messages wait here.
    ready: bool,
    backlog: Vec<Value>,
    /// Open documents: version sent to the server and buffer revision synced.
    documents: HashMap<PathBuf, (u64, u64)>,
}

#[derive(Default)]
pub struct Lsp {
    enabled: bool,
    clients: HashMap<&'static str, Client>,
    /// Languages whose server is missing or has exited.
    unavailable: HashSet<&'static str>,
    overrides: HashMap<&'static str, Vec<String>>,
    diagnostics: HashMap<PathBuf, Vec<Diagnostic>>,
    events: Vec<Event>,
}

/// Commands to try for a language, in order, and the files that mark its
/// project root.
fn servers(language: &str) -> (&'static [&'static [&'static str]], &'static [&'static str]) {
    match language {
        "rust" => (&[&["rust-analyzer"]], &["Cargo.toml"]),
        "python" => (
            &[&["pyright-langserver", "--stdio"], &["pylsp"]],
            &["pyproject.toml", "setup.py", "requirements.txt"],
        ),
        "javascript" | "typescript" | "tsx" => (
            &[&["typescript-language-server", "--stdio"]],
            &["package.json", "tsconfig.json"],
        ),
        "c" => (
            &[&["clangd"]],
            &["compile_commands.json", "Makefile", "CMakeLists.txt"],
        ),
        "json" => (&[&["vscode-json-language-server", "--stdio"]], &[]),
        _ => (&[], &[]),
    }
}

fn language_id(language: &str) -> &str {
    match language {
        "tsx" => "typescriptreact",
        other => other,
    }
}

/// The directory a server should treat as the project: the outermost
/// ancestor holding one of the language's marker files (so a Cargo workspace
/// wins over a member crate), else the git root, else the file's directory.
fn project_root(file: &Path, markers: &[&str]) -> PathBuf {
    let parent = file.parent().unwrap_or(Path::new("/"));
    let has = |dir: &Path, name: &str| dir.join(name).exists();
    let ancestors = || parent.ancestors();
    ancestors()
        .filter(|dir| markers.iter().any(|m| has(dir, m)))
        .last()
        .or_else(|| ancestors().find(|dir| has(dir, ".git")))
        .unwrap_or(parent)
        .to_path_buf()
}

pub fn path_to_uri(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    let mut uri = String::from("file://");
    if !text.starts_with('/') {
        uri.push('/');
    }
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'.' | b'_' | b'~' => {
                uri.push(byte as char)
            }
            _ => uri.push_str(&format!("%{byte:02X}")),
        }
    }
    uri
}

pub fn uri_to_path(uri: &str) -> Option<PathBuf> {
    let rest = uri.strip_prefix("file://")?;
    let mut bytes = Vec::with_capacity(rest.len());
    let mut iter = rest.bytes();
    while let Some(b) = iter.next() {
        if b == b'%' {
            let hex = [iter.next()?, iter.next()?];
            bytes.push(u8::from_str_radix(std::str::from_utf8(&hex).ok()?, 16).ok()?);
        } else {
            bytes.push(b);
        }
    }
    let mut text = String::from_utf8(bytes).ok()?;
    // `file:///C:/dir` on Windows: drop the slash before the drive letter.
    if cfg!(windows) && text.starts_with('/') && text.as_bytes().get(2) == Some(&b':') {
        text.remove(0);
    }
    Some(PathBuf::from(text))
}

/// Read one `Content-Length`-framed message.
fn read_message(reader: &mut impl BufRead) -> Option<Value> {
    let mut length = None;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).ok()? == 0 {
            return None;
        }
        let header = header.trim();
        if header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                length = value.trim().parse::<usize>().ok();
            }
        }
    }
    let mut body = vec![0; length?];
    reader.read_exact(&mut body).ok()?;
    serde_json::from_slice(&body).ok()
}

fn write_message(out: &mut impl Write, message: &Value) -> std::io::Result<()> {
    let body = message.to_string();
    write!(out, "Content-Length: {}\r\n\r\n{body}", body.len())?;
    out.flush()
}

impl Client {
    fn spawn(command: &[String], root: &Path) -> std::io::Result<Self> {
        let mut child = Command::new(&command[0])
            .args(&command[1..])
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let stdin = child.stdin.take().expect("stdin is piped");
        let stdout = child.stdout.take().expect("stdout is piped");
        let (sender, incoming) = mpsc::channel();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            while let Some(message) = read_message(&mut reader) {
                if sender.send(message).is_err() {
                    break;
                }
            }
        });

        let mut client = Self {
            child,
            stdin,
            incoming,
            next_id: 0,
            pending: HashMap::new(),
            ready: false,
            backlog: Vec::new(),
            documents: HashMap::new(),
        };
        let uri = path_to_uri(root);
        let name = root.file_name().unwrap_or_default().to_string_lossy();
        let params = json!({
            "processId": std::process::id(),
            "clientInfo": { "name": "xe", "version": env!("CARGO_PKG_VERSION") },
            "rootUri": uri,
            "workspaceFolders": [{ "uri": uri, "name": name }],
            "capabilities": {
                "general": { "positionEncodings": ["utf-16"] },
                "textDocument": {
                    "synchronization": { "didSave": true },
                    "publishDiagnostics": {},
                    "hover": { "contentFormat": ["plaintext", "markdown"] },
                    "definition": { "linkSupport": false },
                    "completion": { "completionItem": { "snippetSupport": false } }
                }
            }
        });
        client.ready = true;
        client.request("initialize", params, Kind::Initialize);
        client.ready = false;
        Ok(client)
    }

    fn send(&mut self, message: Value) {
        if self.ready {
            // A failed write means the server died; `poll` notices and cleans up.
            let _ = write_message(&mut self.stdin, &message);
        } else {
            self.backlog.push(message);
        }
    }

    fn notify(&mut self, method: &str, params: Value) {
        self.send(json!({ "jsonrpc": "2.0", "method": method, "params": params }));
    }

    fn request(&mut self, method: &str, params: Value, kind: Kind) {
        self.next_id += 1;
        self.pending.insert(self.next_id, kind);
        self.send(
            json!({ "jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params }),
        );
    }
}

impl Drop for Client {
    /// Ask the server to shut down so it can stop its own child processes,
    /// and kill it if it has not exited shortly after.
    fn drop(&mut self) {
        let shutdown = json!({ "jsonrpc": "2.0", "id": self.next_id + 1, "method": "shutdown", "params": null });
        let _ = write_message(&mut self.stdin, &shutdown);
        let _ = write_message(
            &mut self.stdin,
            &json!({ "jsonrpc": "2.0", "method": "exit", "params": null }),
        );
        for _ in 0..20 {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Lsp {
    /// Allow language servers to be started. Off by default so that tests
    /// and `--no-lsp` never spawn processes.
    pub fn enable(&mut self) {
        self.enabled = true;
    }

    /// Use `command` as the server for `language` instead of the built-in list.
    #[cfg(test)]
    pub fn set_server(&mut self, language: &'static str, command: Vec<String>) {
        self.overrides.insert(language, command);
    }

    #[cfg(test)]
    pub fn set_diagnostics(&mut self, path: &Path, list: Vec<Diagnostic>) {
        self.diagnostics.insert(absolute(path), list);
    }

    pub fn diagnostics(&self, path: &Path) -> &[Diagnostic] {
        self.diagnostics
            .get(&absolute(path))
            .map_or(&[], Vec::as_slice)
    }

    fn client(&mut self, language: &'static str, file: &Path) -> Option<&mut Client> {
        if !self.enabled || self.unavailable.contains(language) {
            return None;
        }
        if !self.clients.contains_key(language) {
            let (builtin, markers) = servers(language);
            let mut candidates: Vec<Vec<String>> = builtin
                .iter()
                .map(|c| c.iter().map(|s| s.to_string()).collect())
                .collect();
            if let Some(command) = self.overrides.get(language) {
                candidates = vec![command.clone()];
            }
            let root = project_root(file, markers);
            match candidates
                .iter()
                .find_map(|command| Client::spawn(command, &root).ok())
            {
                Some(client) => self.clients.insert(language, client),
                None => {
                    self.unavailable.insert(language);
                    return None;
                }
            };
        }
        self.clients.get_mut(language)
    }

    /// Make sure the server has the current text of `path`.
    pub fn sync(
        &mut self,
        language: &'static str,
        path: &Path,
        revision: u64,
        text: impl FnOnce() -> String,
    ) {
        let path = absolute(path);
        let Some(client) = self.client(language, &path) else {
            return;
        };
        let uri = path_to_uri(&path);
        match client.documents.get_mut(&path) {
            None => {
                client.documents.insert(path, (1, revision));
                client.notify(
                    "textDocument/didOpen",
                    json!({ "textDocument": {
                        "uri": uri, "languageId": language_id(language), "version": 1, "text": text()
                    }}),
                );
            }
            Some((version, synced)) if *synced != revision => {
                *version += 1;
                *synced = revision;
                let version = *version;
                client.notify(
                    "textDocument/didChange",
                    json!({
                        "textDocument": { "uri": uri, "version": version },
                        "contentChanges": [{ "text": text() }]
                    }),
                );
            }
            Some(_) => {}
        }
    }

    pub fn saved(&mut self, language: &'static str, path: &Path) {
        let path = absolute(path);
        if let Some(client) = self.client(language, &path) {
            client.notify(
                "textDocument/didSave",
                json!({ "textDocument": { "uri": path_to_uri(&path) } }),
            );
        }
    }

    /// Send a position-based request. Returns false if no server is available.
    pub fn request(
        &mut self,
        language: &'static str,
        path: &Path,
        method: &str,
        line: usize,
        col: usize,
        revision: u64,
    ) -> bool {
        let path = absolute(path);
        let Some(client) = self.client(language, &path) else {
            return false;
        };
        let kind = match method {
            "textDocument/definition" => Kind::Definition,
            "textDocument/hover" => Kind::Hover,
            _ => Kind::Completion(revision),
        };
        let params = json!({
            "textDocument": { "uri": path_to_uri(&path) },
            "position": { "line": line, "character": col }
        });
        client.request(method, params, kind);
        true
    }

    /// Handle everything the servers have sent since the last call.
    pub fn poll(&mut self) -> Vec<Event> {
        let mut dead = Vec::new();
        for (&language, client) in self.clients.iter_mut() {
            loop {
                match client.incoming.try_recv() {
                    Ok(message) => handle(client, message, &mut self.diagnostics, &mut self.events),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => {
                        dead.push(language);
                        break;
                    }
                }
            }
        }
        for language in dead {
            self.clients.remove(language);
            self.unavailable.insert(language);
            self.events.push(Event::Status(format!(
                "The {language} language server stopped"
            )));
        }
        std::mem::take(&mut self.events)
    }
}

fn handle(
    client: &mut Client,
    message: Value,
    diagnostics: &mut HashMap<PathBuf, Vec<Diagnostic>>,
    events: &mut Vec<Event>,
) {
    let method = message["method"].as_str();
    let id = &message["id"];
    match (method, id.is_null()) {
        // A request from the server. Each one must be answered or some
        // servers wait forever.
        (Some(method), false) => {
            let result = match method {
                "workspace/configuration" => {
                    let count = message["params"]["items"].as_array().map_or(0, Vec::len);
                    Value::Array(vec![Value::Null; count])
                }
                _ => Value::Null,
            };
            client.send(json!({ "jsonrpc": "2.0", "id": id, "result": result }));
        }
        (Some("textDocument/publishDiagnostics"), true) => {
            let params = &message["params"];
            let Some(path) = params["uri"].as_str().and_then(uri_to_path) else {
                return;
            };
            let list = params["diagnostics"]
                .as_array()
                .map(|items| items.iter().filter_map(diagnostic).collect());
            diagnostics.insert(absolute(&path), list.unwrap_or_default());
            events.push(Event::Redraw);
        }
        (Some("window/showMessage"), true) => {
            if let Some(text) = message["params"]["message"].as_str() {
                events.push(Event::Status(
                    text.lines().next().unwrap_or_default().to_string(),
                ));
            }
        }
        (Some(_), true) => {}
        (None, _) => {
            let Some(kind) = id.as_u64().and_then(|id| client.pending.remove(&id)) else {
                return;
            };
            let result = &message["result"];
            match kind {
                Kind::Initialize => {
                    client.ready = true;
                    client.notify("initialized", json!({}));
                    for queued in std::mem::take(&mut client.backlog) {
                        client.send(queued);
                    }
                }
                Kind::Definition => events.push(Event::Definition(location(result))),
                Kind::Hover => events.push(Event::Hover(hover_text(&result["contents"]))),
                Kind::Completion(revision) => events.push(Event::Completion {
                    revision,
                    items: completion_items(result),
                }),
            }
        }
    }
}

fn position(value: &Value) -> Option<(usize, usize)> {
    Some((
        value["line"].as_u64()? as usize,
        value["character"].as_u64()? as usize,
    ))
}

fn diagnostic(value: &Value) -> Option<Diagnostic> {
    Some(Diagnostic {
        start: position(&value["range"]["start"])?,
        end: position(&value["range"]["end"])?,
        severity: value["severity"].as_u64().unwrap_or(1),
        message: value["message"].as_str()?.to_string(),
    })
}

/// A definition result is a location, a list of them, or a list of links.
fn location(result: &Value) -> Option<(PathBuf, usize, usize)> {
    let first = result
        .as_array()
        .map_or(result, |list| list.first().unwrap_or(&Value::Null));
    let uri = first["uri"]
        .as_str()
        .or_else(|| first["targetUri"].as_str())?;
    let range = if first["range"].is_object() {
        &first["range"]
    } else {
        &first["targetSelectionRange"]
    };
    let (line, col) = position(&range["start"])?;
    Some((uri_to_path(uri)?, line, col))
}

/// Hover contents are a string, a `{ value }` object, or a list of either.
fn hover_text(contents: &Value) -> String {
    let text = match contents {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts.iter().map(hover_text).collect::<Vec<_>>().join("\n"),
        other => other["value"].as_str().unwrap_or_default().to_string(),
    };
    // Drop markdown code fences and surrounding blank lines.
    let lines: Vec<&str> = text
        .lines()
        .filter(|l| !l.trim_start().starts_with("```"))
        .collect();
    lines.join("\n").trim().to_string()
}

fn completion_items(result: &Value) -> Vec<CompletionItem> {
    let list = result.as_array().or_else(|| result["items"].as_array());
    let mut items: Vec<(String, CompletionItem)> = list
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let label = item["label"].as_str()?.trim().to_string();
            let insert = item["textEdit"]["newText"]
                .as_str()
                .or_else(|| item["insertText"].as_str());
            let sort = item["sortText"].as_str().unwrap_or(&label).to_string();
            Some((
                sort,
                CompletionItem {
                    insert: insert.unwrap_or(&label).to_string(),
                    detail: item["detail"].as_str().unwrap_or_default().to_string(),
                    label,
                },
            ))
        })
        .collect();
    items.sort_by(|a, b| a.0.cmp(&b.0));
    items.into_iter().map(|(_, item)| item).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn messages_round_trip_through_the_framing() {
        let mut wire = Vec::new();
        write_message(&mut wire, &json!({ "id": 1, "text": "héllo" })).unwrap();
        write_message(&mut wire, &json!({ "id": 2 })).unwrap();
        let mut reader = Cursor::new(wire);
        assert_eq!(read_message(&mut reader).unwrap()["text"], "héllo");
        assert_eq!(read_message(&mut reader).unwrap()["id"], 2);
        assert!(read_message(&mut reader).is_none());
    }

    #[test]
    fn uris_round_trip() {
        let path = Path::new("/tmp/my dir/файл#1.rs");
        let uri = path_to_uri(path);
        assert_eq!(uri, "file:///tmp/my%20dir/%D1%84%D0%B0%D0%B9%D0%BB%231.rs");
        assert_eq!(uri_to_path(&uri).unwrap(), path);
        assert!(uri_to_path("untitled:1").is_none());
    }

    #[test]
    fn parses_the_shapes_servers_send() {
        let loc =
            json!({ "uri": "file:///a.rs", "range": { "start": { "line": 3, "character": 4 } } });
        assert_eq!(location(&loc), Some((PathBuf::from("/a.rs"), 3, 4)));
        assert_eq!(
            location(&json!([loc])),
            Some((PathBuf::from("/a.rs"), 3, 4))
        );
        let link = json!([{ "targetUri": "file:///b.rs",
            "targetSelectionRange": { "start": { "line": 1, "character": 2 } } }]);
        assert_eq!(location(&link), Some((PathBuf::from("/b.rs"), 1, 2)));
        assert_eq!(location(&Value::Null), None);
        assert_eq!(location(&json!([])), None);

        assert_eq!(hover_text(&json!("plain")), "plain");
        assert_eq!(
            hover_text(&json!({ "kind": "markdown", "value": "```rust\nfn a()\n```\n\ndocs" })),
            "fn a()\n\ndocs"
        );
        assert_eq!(
            hover_text(&json!(["a", { "language": "rust", "value": "b" }])),
            "a\nb"
        );

        let items = completion_items(&json!({ "items": [
            { "label": "zeta", "sortText": "1" },
            { "label": "alpha", "sortText": "2", "insertText": "alpha()", "detail": "fn" },
            { "label": "beta", "sortText": "0", "textEdit": { "newText": "beta!" } },
        ]}));
        let labels: Vec<_> = items
            .iter()
            .map(|i| (i.label.as_str(), i.insert.as_str()))
            .collect();
        assert_eq!(
            labels,
            [("beta", "beta!"), ("zeta", "zeta"), ("alpha", "alpha()")]
        );
        assert!(completion_items(&Value::Null).is_empty());
    }

    #[test]
    fn project_root_prefers_the_outermost_marker() {
        let dir = tempfile::tempdir().unwrap();
        let member = dir.path().join("crates/a/src");
        std::fs::create_dir_all(&member).unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), "").unwrap();
        std::fs::write(dir.path().join("crates/a/Cargo.toml"), "").unwrap();
        assert_eq!(
            project_root(&member.join("lib.rs"), &["Cargo.toml"]),
            dir.path()
        );
        assert_eq!(project_root(&member.join("lib.rs"), &["nothing"]), member);
    }
}
