use super::blocking;
use crate::state::AppState;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

fn ws(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.state::<AppState>().workspace()
}

fn token(app: &AppHandle) -> Option<String> {
    app.state::<AppState>().token.read().clone()
}

macro_rules! git_cmd {
    ($name:ident, |$root:ident $(, $arg:ident : $ty:ty)*| -> $ret:ty $body:block) => {
        #[tauri::command]
        pub async fn $name(app: AppHandle $(, $arg: $ty)*) -> Result<$ret, String> {
            let $root = ws(&app)?;
            #[allow(unused_braces)]
            let f = move || -> Result<$ret, String> { $body };
            blocking(f).await
        }
    };
}

git_cmd!(git_status, |root| -> xe_git::RepoStatus { xe_git::status(&root).map_err(|e| e.to_string()) });
git_cmd!(git_init, |root| -> () { xe_git::init(&root).map_err(|e| e.to_string()) });
git_cmd!(git_stage, |root, paths: Vec<String>| -> () { xe_git::stage(&root, &paths).map_err(|e| e.to_string()) });
git_cmd!(git_stage_all, |root| -> () { xe_git::stage_all(&root).map_err(|e| e.to_string()) });
git_cmd!(git_unstage, |root, paths: Vec<String>| -> () { xe_git::unstage(&root, &paths).map_err(|e| e.to_string()) });
git_cmd!(git_branches, |root| -> Vec<xe_git::BranchInfo> { xe_git::branches(&root).map_err(|e| e.to_string()) });
git_cmd!(git_checkout, |root, name: String, create: bool| -> () {
    xe_git::checkout(&root, &name, create).map_err(|e| e.to_string())
});

/// Discards changes. Untracked files go to the trash, tracked ones are restored.
#[tauri::command]
pub async fn git_discard(app: AppHandle, paths: Vec<String>, untracked: Vec<String>) -> Result<(), String> {
    let root = ws(&app)?;
    blocking(move || {
        for p in &untracked {
            let full = xe_fs::guard::resolve_within(std::slice::from_ref(&root), &root.join(p)).map_err(|e| e.to_string())?;
            xe_fs::ops::delete_to_trash(&full).map_err(|e| e.to_string())?;
        }
        if !paths.is_empty() {
            xe_git::discard(&root, &paths).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_commit(app: AppHandle, message: String) -> Result<String, String> {
    let root = ws(&app)?;
    let user = app.state::<AppState>().user.read().clone();
    blocking(move || {
        let name = user.as_ref().map(|u| u.name.clone().unwrap_or_else(|| u.login.clone()));
        let email = user.as_ref().and_then(|u| u.email.clone());
        xe_git::commit(&root, &message, name.as_deref(), email.as_deref()).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn git_head_text(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let root = ws(&app)?;
    let p = app.state::<AppState>().guard(&path)?;
    blocking(move || xe_git::head_text(&root, &p).map_err(|e| e.to_string())).await
}

/// Gutter markers: compares the editor's current text with the file at HEAD.
#[tauri::command]
pub async fn git_line_changes(app: AppHandle, path: String, text: String) -> Result<Vec<xe_git::LineChange>, String> {
    let Ok(root) = ws(&app) else { return Ok(vec![]) };
    let p = app.state::<AppState>().guard(&path)?;
    blocking(move || {
        let base = xe_git::head_text(&root, &p).ok().flatten();
        Ok(match base {
            Some(b) => xe_git::line_changes(&b, &text),
            None => vec![],
        })
    })
    .await
}

#[tauri::command]
pub async fn git_pull(app: AppHandle) -> Result<String, String> {
    let root = ws(&app)?;
    let t = token(&app);
    blocking(move || xe_git::pull(&root, t.as_deref()).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn git_push(app: AppHandle) -> Result<(), String> {
    let root = ws(&app)?;
    let t = token(&app);
    blocking(move || xe_git::push(&root, t.as_deref()).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn git_fetch(app: AppHandle) -> Result<(), String> {
    let root = ws(&app)?;
    let t = token(&app);
    blocking(move || xe_git::fetch(&root, t.as_deref()).map_err(|e| e.to_string())).await
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneProgress {
    received: usize,
    total: usize,
}

/// Asks where to put the clone, clones into <picked>/<repo-name>, and opens it.
#[tauri::command]
pub async fn git_clone(
    app: AppHandle,
    url: String,
    on_progress: Channel<CloneProgress>,
) -> Result<Option<super::workspace::WorkspaceInfo>, String> {
    if !(url.starts_with("https://") || url.starts_with("git@") || url.starts_with("ssh://")) {
        return Err("use an https:// or SSH repository URL".into());
    }
    let parent = app.dialog().file().set_title("Choose where to clone").blocking_pick_folder();
    let Some(parent) = parent.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    let name = url.trim_end_matches('/').trim_end_matches(".git").rsplit(['/', ':']).next().unwrap_or("repo").to_string();
    let dest = parent.join(&name);
    if dest.exists() {
        return Err(format!("{} already exists", dest.display()));
    }
    let t = token(&app);
    let d = dest.clone();
    blocking(move || {
        xe_git::clone(&url, &d, t.as_deref(), &|received, total| {
            let _ = on_progress.send(CloneProgress { received, total });
        })
        .map_err(|e| e.to_string())
    })
    .await?;
    super::workspace::open_path(&app, dest).map(Some)
}
