use thiserror::Error;

#[derive(Error, Debug)]
pub enum ProcessError {
    #[error("Process not found: {0}")]
    ProcessNotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Process failed to start: {0}")]
    StartFailed(String),
    #[error("Process execution error: {0}")]
    Execution(String),
}

impl serde::Serialize for ProcessError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
