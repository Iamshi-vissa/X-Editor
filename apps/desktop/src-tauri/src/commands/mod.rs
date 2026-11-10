pub mod app;
pub mod auth;
pub mod fs;
pub mod git;
pub mod lsp;
pub mod runtime;
pub mod term;
pub mod workspace;

/// Runs blocking work (git, disk scans, process spawning) off the async runtime.
pub async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}
