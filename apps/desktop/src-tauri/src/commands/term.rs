use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::State;

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TermEvent {
    Data { data: String },
    Exit { code: Option<u32> },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermSpawnArgs {
    pub id: String,
    pub cwd: Option<String>,
    pub shell: Option<String>,
    pub shell_args: Option<Vec<String>>,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub fn term_spawn(state: State<'_, AppState>, args: TermSpawnArgs, on_event: Channel<TermEvent>) -> Result<String, String> {
    let cwd = match args.cwd {
        Some(c) => state.guard(&c)?,
        None => state
            .workspace
            .read()
            .clone()
            .or_else(|| std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from))
            .unwrap_or_else(std::env::temp_dir),
    };
    let default = xe_term::default_shell();
    let (program, shell_args) = match args.shell.filter(|s| !s.trim().is_empty()) {
        Some(s) => (s, args.shell_args.unwrap_or_default()),
        None => (default.program, default.args),
    };
    let kind = xe_term::shell_kind(&program).to_string();
    let data_ch = on_event.clone();
    state
        .terms
        .spawn(
            xe_term::SpawnOptions { id: args.id, program, args: shell_args, cwd, cols: args.cols, rows: args.rows, env: vec![] },
            move |data| {
                let _ = data_ch.send(TermEvent::Data { data });
            },
            move |code| {
                let _ = on_event.send(TermEvent::Exit { code });
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(kind)
}

#[tauri::command]
pub fn term_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    state.terms.write(&id, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn term_resize(state: State<'_, AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    state.terms.resize(&id, cols, rows).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn term_kill(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.terms.kill(&id).map_err(|e| e.to_string())
}
