use crate::state::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub root: String,
    pub name: String,
}

pub fn open_path(app: &AppHandle, path: PathBuf) -> Result<WorkspaceInfo, String> {
    let state = app.state::<AppState>();
    let root = path
        .canonicalize()
        .map_err(|e| format!("can't open {}: {e}", path.display()))?;
    if !root.is_dir() {
        return Err(format!("{} is not a folder", root.display()));
    }
    *state.workspace.write() = Some(root.clone());
    let handle = app.clone();
    let watcher = xe_fs::watch::WorkspaceWatcher::start(&root, move |paths| {
        let list: Vec<String> = paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        let _ = handle.emit("fs://changed", list);
    })
    .map_err(|e| log::warn!("file watcher unavailable: {e}"))
    .ok();
    *state.watcher.lock() = watcher;
    let root_s = root.to_string_lossy().to_string();
    state.push_recent(&root_s);
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root_s.clone());
    Ok(WorkspaceInfo { root: root_s, name })
}

/// Shows the native folder picker and opens what the user chose.
#[tauri::command]
pub async fn workspace_pick(app: AppHandle) -> Result<Option<WorkspaceInfo>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Open Folder")
        .blocking_pick_folder();
    match picked.and_then(|p| p.into_path().ok()) {
        Some(p) => open_path(&app, p).map(Some),
        None => Ok(None),
    }
}

/// Opens a folder from the recent list (only paths the user opened before are accepted).
#[tauri::command]
pub fn workspace_open_recent(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<WorkspaceInfo, String> {
    if !state.recent().contains(&path) {
        return Err("that folder isn't in the recent list".into());
    }
    open_path(&app, PathBuf::from(path))
}

#[tauri::command]
pub fn workspace_recent(state: State<'_, AppState>) -> Vec<String> {
    state.recent()
}

#[tauri::command]
pub fn workspace_remove_recent(state: State<'_, AppState>, path: String) {
    let mut s = state.config.read_state();
    let list: Vec<String> = state.recent().into_iter().filter(|p| p != &path).collect();
    s["recent"] = serde_json::json!(list);
    let _ = state.config.write_state(&s);
}

#[tauri::command]
pub fn workspace_close(state: State<'_, AppState>) {
    *state.watcher.lock() = None;
    *state.workspace.write() = None;
    state.lsp.stop_all();
}
