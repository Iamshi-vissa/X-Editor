use serde::Serialize;
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
    #[error("Task not found: {0}")]
    TaskNotFound(String),
    #[error("Circular task dependency detected: {0}")]
    CircularTaskDependency(String),
    #[error("Process failure: {0}")]
    ProcessFailed(String),
    #[error("Security policy error: {0}")]
    SecurityError(String),
    #[error("Toolchain not found: {0}")]
    ToolchainNotFound(String),
    #[error("Toolchain unavailable: {0}")]
    ToolchainUnavailable(String),
    #[error("Checksum mismatch: Expected {expected}, got {got}")]
    ChecksumMismatch { expected: String, got: String },
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
