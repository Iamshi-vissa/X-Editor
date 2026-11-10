use crate::state::AppState;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LspEvent {
    Message { data: String },
    Log { data: String },
    Exit,
}

#[tauri::command]
pub fn lsp_start(
    state: State<'_, AppState>,
    id: String,
    command: String,
    args: Vec<String>,
    on_event: Channel<LspEvent>,
) -> Result<(), String> {
    let root = state.workspace()?;
    let (m, l) = (on_event.clone(), on_event.clone());
    state
        .lsp
        .start(
            id,
            &command,
            &args,
            root,
            move |data| {
                let _ = m.send(LspEvent::Message { data });
            },
            move |data| {
                let _ = l.send(LspEvent::Log { data });
            },
            move || {
                let _ = on_event.send(LspEvent::Exit);
            },
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lsp_send(state: State<'_, AppState>, id: String, message: String) -> Result<(), String> {
    state.lsp.send(&id, &message).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lsp_stop(state: State<'_, AppState>, id: String) {
    state.lsp.stop(&id);
}

#[tauri::command]
pub fn lsp_available(commands: Vec<String>) -> Vec<xe_lsp::ServerAvailability> {
    commands.into_iter().map(|c| xe_lsp::ServerAvailability { installed: xe_lsp::is_installed(&c), command: c }).collect()
}
