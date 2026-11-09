use notify::{Config, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc::channel;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceChangeEvent {
    pub kind: String, // "create" | "modify" | "remove" | "rename"
    pub path: String,
}

pub struct WorkspaceWatcher {
    _watcher: notify::RecommendedWatcher,
}

impl WorkspaceWatcher {
    pub fn start<F>(workspace_root: PathBuf, on_change: F) -> Result<Self, String>
    where
        F: Fn(WorkspaceChangeEvent) + Send + Sync + 'static,
    {
        let (tx, rx) = channel();

        let mut watcher =
            notify::RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string())?;

        watcher
            .watch(&workspace_root, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;

        std::thread::spawn(move || {
            // Watcher errors are dropped; only successful events are forwarded.
            for event in rx.into_iter().flatten() {
                let kind_str = match event.kind {
                    EventKind::Create(_) => "create",
                    EventKind::Modify(_) => "modify",
                    EventKind::Remove(_) => "remove",
                    EventKind::Any | EventKind::Other | EventKind::Access(_) => "modify",
                };

                for path in event.paths {
                    on_change(WorkspaceChangeEvent {
                        kind: kind_str.to_string(),
                        path: path.to_string_lossy().into_owned(),
                    });
                }
            }
        });

        Ok(WorkspaceWatcher { _watcher: watcher })
    }
}
