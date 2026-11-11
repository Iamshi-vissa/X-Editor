use super::blocking;
use crate::state::AppState;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use xe_fs::ops::{DirEntry, FileContent};
use xe_fs::search::{SearchMatch, SearchOptions};

#[tauri::command]
pub fn fs_list_dir(state: State<'_, AppState>, path: String) -> Result<Vec<DirEntry>, String> {
    let p = state.guard(&path)?;
    xe_fs::ops::list_dir(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_read(state: State<'_, AppState>, path: String) -> Result<FileContent, String> {
    let p = state.guard(&path)?;
    xe_fs::ops::read_text(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_write(state: State<'_, AppState>, path: String, text: String) -> Result<(), String> {
    let p = state.guard(&path)?;
    xe_fs::ops::write_text_atomic(&p, &text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_create_file(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let p = state.guard(&path)?;
    xe_fs::ops::create_file(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_create_dir(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let p = state.guard(&path)?;
    xe_fs::ops::create_dir(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_rename(state: State<'_, AppState>, from: String, to: String) -> Result<(), String> {
    let (a, b) = (state.guard(&from)?, state.guard(&to)?);
    xe_fs::ops::rename(&a, &b).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_delete(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let p = state.guard(&path)?;
    if state.workspace.read().as_ref() == Some(&p) {
        return Err("refusing to delete the workspace folder itself".into());
    }
    xe_fs::ops::delete_to_trash(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_list_files(app: AppHandle) -> Result<Vec<String>, String> {
    let root = app.state::<AppState>().workspace()?;
    blocking(move || Ok(xe_fs::search::list_files(&root, 100_000))).await
}

#[tauri::command]
pub async fn fs_search(app: AppHandle, options: SearchOptions) -> Result<Vec<SearchMatch>, String> {
    let root = app.state::<AppState>().workspace()?;
    blocking(move || xe_fs::search::search(&root, &options).map_err(|e| e.to_string())).await
}

/// Native "Open File" dialog. Picked files are allowed even outside the workspace.
#[tauri::command]
pub async fn fs_pick_file(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Open File")
        .blocking_pick_file();
    Ok(picked.and_then(|p| p.into_path().ok()).and_then(|p| {
        let p = p.canonicalize().ok()?;
        app.state::<AppState>()
            .picked_files
            .write()
            .insert(p.clone());
        Some(p.to_string_lossy().to_string())
    }))
}

/// Native "Save As" dialog for untitled files.
#[tauri::command]
pub async fn fs_pick_save_path(
    app: AppHandle,
    suggested_name: Option<String>,
) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();
    let mut dialog = app.dialog().file().set_title("Save As");
    if let Ok(ws) = state.workspace() {
        dialog = dialog.set_directory(ws);
    }
    if let Some(n) = suggested_name {
        dialog = dialog.set_file_name(n);
    }
    let picked = dialog.blocking_save_file();
    Ok(picked.and_then(|p| p.into_path().ok()).and_then(|p| {
        let resolved = xe_fs::guard::canonicalize_lenient(&p).ok()?;
        state.picked_files.write().insert(resolved.clone());
        Some(resolved.to_string_lossy().to_string())
    }))
}
