use parking_lot::{Mutex, RwLock};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use xe_config::ConfigStore;
use xe_fs::watch::WorkspaceWatcher;
use xe_lsp::LspManager;
use xe_term::TerminalManager;

pub struct AppState {
    pub workspace: RwLock<Option<PathBuf>>,
    /// Files outside the workspace the user explicitly picked in a native dialog.
    pub picked_files: RwLock<HashSet<PathBuf>>,
    pub watcher: Mutex<Option<WorkspaceWatcher>>,
    pub terms: TerminalManager,
    pub lsp: LspManager,
    pub config: ConfigStore,
    pub auth_cancel: Mutex<Option<Arc<AtomicBool>>>,
    pub token: RwLock<Option<String>>,
    pub user: RwLock<Option<xe_auth::GithubUser>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            workspace: RwLock::new(None),
            picked_files: RwLock::new(HashSet::new()),
            watcher: Mutex::new(None),
            terms: TerminalManager::new(),
            lsp: LspManager::new(),
            config: ConfigStore::new(),
            auth_cancel: Mutex::new(None),
            token: RwLock::new(None),
            user: RwLock::new(None),
        }
    }

    pub fn workspace(&self) -> Result<PathBuf, String> {
        self.workspace
            .read()
            .clone()
            .ok_or_else(|| "no folder is open".to_string())
    }

    /// Resolves a path the UI sent and checks it's inside the workspace, the config folder,
    /// or a file the user picked in a dialog.
    pub fn guard(&self, path: &str) -> Result<PathBuf, String> {
        let target = PathBuf::from(path);
        let mut roots = vec![self.config.dir().to_path_buf()];
        if let Some(ws) = self.workspace.read().clone() {
            roots.push(ws);
        }
        match xe_fs::guard::resolve_within(&roots, &target) {
            Ok(p) => Ok(p),
            Err(e) => {
                let resolved =
                    xe_fs::guard::canonicalize_lenient(&target).map_err(|e| e.to_string())?;
                if self.picked_files.read().contains(&resolved) {
                    Ok(resolved)
                } else {
                    Err(e.to_string())
                }
            }
        }
    }

    pub fn recent(&self) -> Vec<String> {
        self.config.read_state()["recent"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn push_recent(&self, path: &str) {
        let mut state = self.config.read_state();
        let mut list = self.recent();
        list.retain(|p| p != path);
        list.insert(0, path.to_string());
        list.truncate(15);
        state["recent"] = serde_json::json!(list);
        let _ = self.config.write_state(&state);
    }

    pub fn github_client_id(&self) -> Option<String> {
        if let Ok(v) = std::env::var("XE_GITHUB_CLIENT_ID") {
            if !v.trim().is_empty() {
                return Some(v);
            }
        }
        if let Some(v) = option_env!("XE_GITHUB_CLIENT_ID") {
            if !v.trim().is_empty() {
                return Some(v.to_string());
            }
        }
        self.config
            .read_settings()
            .ok()
            .and_then(|s| {
                s.pointer("/github/clientId")
                    .and_then(|v| v.as_str())
                    .map(String::from)
            })
            .filter(|s| !s.trim().is_empty())
    }
}
