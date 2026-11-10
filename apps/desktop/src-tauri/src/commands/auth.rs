use crate::state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use xe_auth::{DeviceCode, GithubRepo, GithubUser};

/// Restores the session from the keychain on startup.
#[tauri::command]
pub async fn auth_status(app: AppHandle) -> Result<Option<GithubUser>, String> {
    let state = app.state::<AppState>();
    if let Some(u) = state.user.read().clone() {
        return Ok(Some(u));
    }
    let Some(token) = tauri::async_runtime::spawn_blocking(xe_auth::load_token)
        .await
        .ok()
        .flatten()
    else {
        return Ok(None);
    };
    match xe_auth::fetch_user(&token).await {
        Ok(user) => {
            *state.token.write() = Some(token);
            *state.user.write() = Some(user.clone());
            Ok(Some(user))
        }
        // Offline: keep the token so git still works, but report no profile.
        Err(xe_auth::AuthError::Http(e)) if e.status().is_none() => {
            *state.token.write() = Some(token);
            Ok(None)
        }
        Err(_) => {
            let _ = xe_auth::delete_token();
            Ok(None)
        }
    }
}

#[tauri::command]
pub async fn auth_login_start(app: AppHandle) -> Result<DeviceCode, String> {
    let client_id = app
        .state::<AppState>()
        .github_client_id()
        .ok_or_else(|| xe_auth::AuthError::NoClientId.to_string())?;
    xe_auth::start_device_flow(&client_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_login_wait(app: AppHandle, code: DeviceCode) -> Result<GithubUser, String> {
    let state = app.state::<AppState>();
    let client_id = state
        .github_client_id()
        .ok_or_else(|| xe_auth::AuthError::NoClientId.to_string())?;
    let cancel = Arc::new(AtomicBool::new(false));
    *state.auth_cancel.lock() = Some(cancel.clone());
    let token = xe_auth::wait_for_token(&client_id, &code, cancel)
        .await
        .map_err(|e| e.to_string())?;
    let user = xe_auth::fetch_user(&token)
        .await
        .map_err(|e| e.to_string())?;
    if let Err(e) = xe_auth::save_token(&token) {
        log::warn!("{e}; you'll need to sign in again next time");
    }
    *state.token.write() = Some(token);
    *state.user.write() = Some(user.clone());
    Ok(user)
}

#[tauri::command]
pub fn auth_cancel(state: State<'_, AppState>) {
    if let Some(c) = state.auth_cancel.lock().take() {
        c.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn auth_logout(state: State<'_, AppState>) -> Result<(), String> {
    *state.token.write() = None;
    *state.user.write() = None;
    xe_auth::delete_token().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn github_repos(app: AppHandle) -> Result<Vec<GithubRepo>, String> {
    let token = app
        .state::<AppState>()
        .token
        .read()
        .clone()
        .ok_or("sign in with GitHub first")?;
    xe_auth::list_repos(&token).await.map_err(|e| e.to_string())
}
