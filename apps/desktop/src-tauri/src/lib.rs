pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        let _ = app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        );
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        commands::workspace_select,
        commands::workspace_get,
        commands::workspace_list_directory,
        commands::filesystem_read_file,
        commands::filesystem_write_file,
        commands::filesystem_create_file,
        commands::filesystem_create_dir,
        commands::filesystem_rename,
        commands::filesystem_delete,
        commands::filesystem_search,
        commands::process_spawn,
        commands::process_spawn_toolchain_terminal,
        commands::process_write_stdin,
        commands::process_kill,
        commands::task_list,
        commands::task_get,
        commands::task_run,
        commands::task_build,
        commands::task_clean,
        commands::task_test,
        commands::task_cancel,
        commands::task_clear_history,
        commands::task_history,
        commands::task_trust_set,
        commands::task_trust_get,
        commands::toolchain_list_installed,
        commands::toolchain_list_available,
        commands::toolchain_detect,
        commands::toolchain_get_active,
        commands::toolchain_install,
        commands::toolchain_uninstall,
        commands::toolchain_set_project,
        commands::settings_get,
        commands::settings_update
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
