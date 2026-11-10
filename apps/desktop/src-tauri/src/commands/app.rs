use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    os: &'static str,
    version: &'static str,
    config_dir: String,
    settings_path: String,
    shell: xe_term::ShellInfo,
    github_configured: bool,
}

#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        os: std::env::consts::OS,
        version: env!("CARGO_PKG_VERSION"),
        config_dir: state.config.dir().to_string_lossy().into(),
        settings_path: state.config.settings_path().to_string_lossy().into(),
        shell: xe_term::default_shell(),
        github_configured: state.github_client_id().is_some(),
    }
}

#[tauri::command]
pub fn settings_read(state: State<'_, AppState>) -> Result<Value, String> {
    state.config.read_settings()
}

#[tauri::command]
pub fn settings_write(state: State<'_, AppState>, value: Value) -> Result<(), String> {
    state
        .config
        .write_settings(&value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_read(state: State<'_, AppState>) -> Value {
    state.config.read_state()
}

/// Saves the UI session (open tabs, layout). The `recent` list is owned by the backend.
#[tauri::command]
pub fn session_write(state: State<'_, AppState>, mut value: Value) -> Result<(), String> {
    if let Some(obj) = value.as_object_mut() {
        obj.insert("recent".into(), serde_json::json!(state.recent()));
    }
    state.config.write_state(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn themes_read(state: State<'_, AppState>) -> Vec<Value> {
    state.config.read_themes()
}
