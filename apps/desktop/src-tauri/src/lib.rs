mod commands;
mod state;

use commands::*;
use tauri::Manager;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .manage(state::AppState::new())
        .setup(|app| {
            // macOS keeps native traffic lights over our title bar; elsewhere we draw our own.
            #[cfg(not(target_os = "macos"))]
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_decorations(false);
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::app_info,
            app::settings_read,
            app::settings_write,
            app::session_read,
            app::session_write,
            app::themes_read,
            workspace::workspace_pick,
            workspace::workspace_open_recent,
            workspace::workspace_recent,
            workspace::workspace_remove_recent,
            workspace::workspace_close,
            fs::fs_list_dir,
            fs::fs_read,
            fs::fs_write,
            fs::fs_create_file,
            fs::fs_create_dir,
            fs::fs_rename,
            fs::fs_delete,
            fs::fs_list_files,
            fs::fs_search,
            fs::fs_pick_file,
            fs::fs_pick_save_path,
            term::term_spawn,
            term::term_write,
            term::term_resize,
            term::term_kill,
            git::git_status,
            git::git_init,
            git::git_stage,
            git::git_stage_all,
            git::git_unstage,
            git::git_discard,
            git::git_commit,
            git::git_branches,
            git::git_checkout,
            git::git_head_text,
            git::git_line_changes,
            git::git_pull,
            git::git_push,
            git::git_fetch,
            git::git_clone,
            auth::auth_status,
            auth::auth_login_start,
            auth::auth_login_wait,
            auth::auth_cancel,
            auth::auth_logout,
            auth::github_repos,
            lsp::lsp_start,
            lsp::lsp_send,
            lsp::lsp_stop,
            lsp::lsp_available,
            runtime::runtime_report,
            runtime::run_plan_file,
            runtime::run_plan_project,
            runtime::shell_quote,
        ])
        .build(tauri::generate_context!())
        .expect("failed to start X-Editor");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = handle.state::<state::AppState>();
            state.terms.kill_all();
            state.lsp.stop_all();
        }
    });
}
