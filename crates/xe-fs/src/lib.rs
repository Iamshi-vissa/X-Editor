//! Filesystem access for X-Editor: a path guard that keeps every operation inside
//! allowed roots, atomic file writes, .gitignore-aware file listing and search,
//! and a debounced workspace watcher.

pub mod guard;
pub mod ops;
pub mod search;
pub mod watch;

#[derive(Debug, thiserror::Error)]
pub enum FsError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("path is outside the open workspace: {0}")]
    OutsideWorkspace(String),
    #[error("file looks binary and can't be opened as text")]
    Binary,
    #[error("file is too large to open ({0} MB, limit {1} MB)")]
    TooLarge(u64, u64),
    #[error("invalid search pattern: {0}")]
    Pattern(String),
    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for FsError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, FsError>;
