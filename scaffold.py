import os

files = {
    'crates/x-security/src/lib.rs': 'pub mod paths;\n',
    'crates/x-security/src/paths.rs': '''use std::path::{Path, PathBuf};
use std::io;

pub fn validate_path_in_workspace(workspace_root: &Path, target_path: &Path) -> io::Result<PathBuf> {
    let canonical_root = workspace_root.canonicalize()?;
    
    let canonical_target = if target_path.exists() {
        target_path.canonicalize()?
    } else {
        let parent = target_path.parent().unwrap_or(Path::new(""));
        let canonical_parent = parent.canonicalize()?;
        canonical_parent.join(target_path.file_name().unwrap_or_default())
    };

    if canonical_target.starts_with(&canonical_root) {
        Ok(canonical_target)
    } else {
        Err(io::Error::new(io::ErrorKind::PermissionDenied, "Path is outside the workspace"))
    }
}
''',
    'crates/x-filesystem/src/lib.rs': 'pub mod file;\npub mod directory;\n',
    'crates/x-filesystem/src/file.rs': '''use std::fs;
use std::path::Path;
use std::io;

pub fn read_file_content(path: &Path) -> io::Result<String> {
    fs::read_to_string(path)
}

pub fn write_file_content(path: &Path, content: &str) -> io::Result<()> {
    fs::write(path, content)
}
''',
    'crates/x-filesystem/src/directory.rs': '''use std::fs;
use std::path::Path;
use std::io;

#[derive(Debug, serde::Serialize)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn list_directory(path: &Path) -> io::Result<Vec<DirectoryEntry>> {
    let mut entries = Vec::new();
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let path_buf = entry.path();
            entries.push(DirectoryEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: path_buf.to_string_lossy().into_owned(),
                is_dir: path_buf.is_dir(),
            });
        }
    }
    // Sort directories first, then files
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}
''',
    'crates/x-filesystem/Cargo.toml': '''[package]
name = "x-filesystem"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
''',
    'crates/x-security/Cargo.toml': '''[package]
name = "x-security"
version = "0.1.0"
edition = "2021"

[dependencies]
''',
    'crates/x-core/Cargo.toml': '''[package]
name = "x-core"
version = "0.1.0"
edition = "2021"

[dependencies]
x-filesystem = { path = "../x-filesystem" }
x-security = { path = "../x-security" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"
''',
    'crates/x-core/src/lib.rs': '''pub mod workspace;
pub mod documents;
pub mod settings;
pub mod errors;
''',
    'crates/x-core/src/errors.rs': '''use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum XCoreError {
    #[error("File not found")]
    FileNotFound,
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("Workspace not open")]
    WorkspaceNotOpen,
    #[error("Path is outside workspace")]
    OutsideWorkspace,
    #[error("IO Error: {0}")]
    Io(String),
}

impl Serialize for XCoreError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for XCoreError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => XCoreError::FileNotFound,
            std::io::ErrorKind::PermissionDenied => XCoreError::PermissionDenied(err.to_string()),
            _ => XCoreError::Io(err.to_string()),
        }
    }
}
''',
    'crates/x-core/src/workspace.rs': '''use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::OnceLock;

pub struct WorkspaceState {
    pub root: Option<PathBuf>,
}

static WORKSPACE: OnceLock<Mutex<WorkspaceState>> = OnceLock::new();

pub fn get_workspace_state() -> &'static Mutex<WorkspaceState> {
    WORKSPACE.get_or_init(|| Mutex::new(WorkspaceState { root: None }))
}

pub fn set_workspace(path: PathBuf) {
    let mut state = get_workspace_state().lock().unwrap();
    state.root = Some(path);
}

pub fn get_workspace() -> Option<PathBuf> {
    let state = get_workspace_state().lock().unwrap();
    state.root.clone()
}
''',
    'crates/x-core/src/documents.rs': '''// Documents model 
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Document {
    pub id: String,
    pub path: String,
    pub language: String,
    pub content: String,
    pub version: u32,
    pub is_dirty: bool,
    pub encoding: String,
}
''',
    'crates/x-core/src/settings.rs': '''// Settings
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
        }
    }
}
'''
}

for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(content)
