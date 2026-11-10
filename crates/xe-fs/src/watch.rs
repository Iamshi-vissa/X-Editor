use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Keeps a recursive watch on a folder alive; dropping it stops watching.
pub struct WorkspaceWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher>,
}

impl WorkspaceWatcher {
    /// Calls `on_change` with batches of changed paths (debounced by 250 ms).
    /// Changes inside `.git/objects` and `target`/`node_modules` noise are filtered out.
    pub fn start<F>(root: &Path, on_change: F) -> notify::Result<Self>
    where
        F: Fn(Vec<PathBuf>) + Send + 'static,
    {
        let mut debouncer = new_debouncer(Duration::from_millis(250), move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let paths: Vec<PathBuf> = events
                    .into_iter()
                    .map(|e| e.path)
                    .filter(|p| {
                        let s = p.to_string_lossy();
                        !(s.contains("/.git/objects") || s.contains("\\.git\\objects") || s.ends_with(".xe-tmp"))
                    })
                    .collect();
                if !paths.is_empty() {
                    on_change(paths);
                }
            }
        })?;
        debouncer.watcher().watch(root, RecursiveMode::Recursive)?;
        Ok(Self { _debouncer: debouncer })
    }
}
