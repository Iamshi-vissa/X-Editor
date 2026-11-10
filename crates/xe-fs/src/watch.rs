use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Keeps a recursive watch on a folder alive; dropping it stops watching.
pub struct WorkspaceWatcher {
    _watcher: RecommendedWatcher,
    alive: Arc<AtomicBool>,
}

/// True for paths that change constantly but never matter to the UI.
fn is_noise(p: &Path) -> bool {
    let s = p.to_string_lossy();
    s.ends_with(".xe-tmp")
        || s.contains("/.git/objects")
        || s.contains("\\.git\\objects")
        || s.ends_with(".git/index.lock")
        || s.ends_with(".git\\index.lock")
}

impl WorkspaceWatcher {
    /// Calls `on_change` with batches of changed paths, at most every 250 ms.
    ///
    /// Only real changes (create / modify / remove / rename) are reported. Reads are not:
    /// on Linux inotify also reports file opens, and forwarding those would make the app
    /// react to its own reads in an endless loop.
    pub fn start<F>(root: &Path, on_change: F) -> notify::Result<Self>
    where
        F: Fn(Vec<PathBuf>) + Send + 'static,
    {
        let pending: Arc<Mutex<BTreeSet<PathBuf>>> = Arc::default();
        let alive = Arc::new(AtomicBool::new(true));

        let sink = pending.clone();
        let mut watcher =
            notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                let Ok(event) = res else { return };
                if matches!(event.kind, EventKind::Access(_) | EventKind::Other) {
                    return;
                }
                let mut set = sink.lock();
                set.extend(event.paths.into_iter().filter(|p| !is_noise(p)));
            })?;
        watcher.watch(root, RecursiveMode::Recursive)?;

        let flag = alive.clone();
        std::thread::Builder::new()
            .name("fs-watch-batch".into())
            .spawn(move || {
                while flag.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_millis(250));
                    let batch: Vec<PathBuf> =
                        std::mem::take(&mut *pending.lock()).into_iter().collect();
                    if !batch.is_empty() && flag.load(Ordering::Relaxed) {
                        on_change(batch);
                    }
                }
            })
            .map_err(|e| notify::Error::generic(&e.to_string()))?;

        Ok(Self {
            _watcher: watcher,
            alive,
        })
    }
}

impl Drop for WorkspaceWatcher {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn reports_writes_but_not_reads() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let file = root.join("a.txt");
        std::fs::write(&file, "x").unwrap();
        let (tx, rx) = mpsc::channel::<Vec<PathBuf>>();
        let _w = WorkspaceWatcher::start(&root, move |p| {
            let _ = tx.send(p);
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(300));
        while rx.try_recv().is_ok() {}

        // Reading must not produce events.
        for _ in 0..5 {
            let _ = std::fs::read_to_string(&file).unwrap();
        }
        assert!(
            rx.recv_timeout(Duration::from_millis(700)).is_err(),
            "reads were reported as changes"
        );

        // Writing must.
        std::fs::write(&file, "y").unwrap();
        let got = rx
            .recv_timeout(Duration::from_secs(3))
            .expect("no event for a write");
        assert!(got.iter().any(|p| p.ends_with("a.txt")));
    }
}
