use x_core::errors::XCoreError;
use x_core::workspace::{get_workspace, set_workspace};
use x_core::settings::AppSettings;
use x_core::tasks::config::load_tasks_config;
use x_core::tasks::model::{Task, TaskExecution, TaskType};
use x_core::tasks::runner::{run_task_by_id, run_task_by_type, cancel_task_execution, get_task_runner_state, clear_task_history};
use x_core::toolchains::manifest::{ToolchainManifest, ToolchainScope, ProjectToolchainRequirement};
use x_core::toolchains::registry::get_toolchain_registry;
use x_core::toolchains::resolver::{load_project_toolchain_config, save_project_toolchain_config, resolve_active_project_toolchains};
use x_core::toolchains::downloader::download_and_install_toolchain;
use x_core::toolchains::environment::ResolvedToolchainEnvironment;
use x_filesystem::directory::{list_directory, DirectoryEntry};
use x_filesystem::file::{read_file_content, write_file_content};
use x_filesystem::operations::{create_file, create_directory, rename_path, delete_path};
use x_filesystem::search::{search_workspace, SearchResultMatch};
use x_process::process_manager::{spawn_process, spawn_process_with_env, write_process_stdin, kill_process};
use x_security::paths::validate_path_in_workspace;
use x_security::trust::{get_workspace_trust, set_workspace_trust, validate_toolchain_authorization, WorkspaceTrustState};
use std::path::PathBuf;
use tauri::Emitter;

#[tauri::command]
pub fn workspace_select(path: String) -> Result<(), XCoreError> {
    set_workspace(PathBuf::from(path));
    Ok(())
}

#[tauri::command]
pub fn workspace_get() -> Result<Option<PathBuf>, XCoreError> {
    Ok(get_workspace())
}

#[tauri::command]
pub fn workspace_list_directory(path: String) -> Result<Vec<DirectoryEntry>, XCoreError> {
    let target = PathBuf::from(&path);
    let valid_path = if let Some(workspace_root) = get_workspace() {
        validate_path_in_workspace(&workspace_root, &target)?
    } else {
        if target.exists() {
            set_workspace(target.clone());
        }
        target
    };
    list_directory(&valid_path).map_err(Into::into)
}

#[tauri::command]
pub fn filesystem_read_file(path: String) -> Result<String, XCoreError> {
    let target = PathBuf::from(&path);
    let valid_path = if let Some(workspace_root) = get_workspace() {
        validate_path_in_workspace(&workspace_root, &target)?
    } else {
        target
    };
    read_file_content(&valid_path).map_err(Into::into)
}

#[tauri::command]
pub fn filesystem_write_file(path: String, content: String) -> Result<(), XCoreError> {
    let target = PathBuf::from(&path);
    let valid_path = if let Some(workspace_root) = get_workspace() {
        validate_path_in_workspace(&workspace_root, &target)?
    } else {
        if let Some(parent) = target.parent() {
            if parent.exists() {
                set_workspace(parent.to_path_buf());
            }
        }
        target
    };
    write_file_content(&valid_path, &content).map_err(Into::into)
}

#[tauri::command]
pub fn filesystem_create_file(path: String, content: Option<String>) -> Result<(), XCoreError> {
    let target = PathBuf::from(&path);
    let valid_path = if let Some(workspace_root) = get_workspace() {
        validate_path_in_workspace(&workspace_root, &target)?
    } else {
        if let Some(parent) = target.parent() {
            if parent.exists() {
                set_workspace(parent.to_path_buf());
            }
        }
        target
    };
    create_file(&valid_path, content.as_deref().unwrap_or("")).map_err(Into::into)
}

#[tauri::command]
pub fn filesystem_create_dir(path: String) -> Result<(), XCoreError> {
    let target = PathBuf::from(&path);
    let valid_path = if let Some(workspace_root) = get_workspace() {
        validate_path_in_workspace(&workspace_root, &target)?
    } else {
        target
    };
    create_directory(&valid_path).map_err(Into::into)
}

#[tauri::command]
pub fn filesystem_rename(old_path: String, new_path: String) -> Result<(), XCoreError> {
    let old_target = PathBuf::from(old_path);
    let new_target = PathBuf::from(new_path);
    let (valid_old, valid_new) = if let Some(workspace_root) = get_workspace() {
        (
            validate_path_in_workspace(&workspace_root, &old_target)?,
            validate_path_in_workspace(&workspace_root, &new_target)?,
        )
    } else {
        (old_target, new_target)
    };
    rename_path(&valid_old, &valid_new).map_err(Into::into)
}

#[tauri::command]
pub fn filesystem_delete(path: String) -> Result<(), XCoreError> {
    let target = PathBuf::from(&path);
    let valid_path = if let Some(workspace_root) = get_workspace() {
        validate_path_in_workspace(&workspace_root, &target)?
    } else {
        target
    };
    delete_path(&valid_path).map_err(Into::into)
}

#[tauri::command]
pub fn filesystem_search(query: String, is_content: bool) -> Result<Vec<SearchResultMatch>, XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    let results = search_workspace(&workspace_root, &query, is_content, 100);
    Ok(results)
}

#[tauri::command]
pub async fn process_spawn(
    app: tauri::AppHandle,
    process_id: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<String, String> {
    let workspace_root = get_workspace().ok_or_else(|| "Workspace not open".to_string())?;
    let target_cwd = cwd.map(PathBuf::from).unwrap_or_else(|| workspace_root.clone());
    let valid_cwd = validate_path_in_workspace(&workspace_root, &target_cwd)
        .map_err(|e| e.to_string())?;

    let app_out = app.clone();
    let app_err = app.clone();
    let app_exit = app.clone();

    spawn_process(
        process_id.clone(),
        command,
        args,
        valid_cwd,
        move |chunk| {
            let _ = app_out.emit("process://stdout", chunk);
        },
        move |chunk| {
            let _ = app_err.emit("process://stderr", chunk);
        },
        move |exit| {
            let _ = app_exit.emit("process://exit", exit);
        },
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn process_spawn_toolchain_terminal(
    app: tauri::AppHandle,
    process_id: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<String, String> {
    let workspace_root = get_workspace().ok_or_else(|| "Workspace not open".to_string())?;
    let target_cwd = cwd.map(PathBuf::from).unwrap_or_else(|| workspace_root.clone());
    let valid_cwd = validate_path_in_workspace(&workspace_root, &target_cwd)
        .map_err(|e| e.to_string())?;

    let active_toolchains = resolve_active_project_toolchains(&workspace_root);
    let toolchain_env = ResolvedToolchainEnvironment::build(&active_toolchains);

    let app_out = app.clone();
    let app_err = app.clone();
    let app_exit = app.clone();

    spawn_process_with_env(
        process_id.clone(),
        command,
        args,
        valid_cwd,
        Some(toolchain_env.env_map),
        move |chunk| {
            let _ = app_out.emit("process://stdout", chunk);
        },
        move |chunk| {
            let _ = app_err.emit("process://stderr", chunk);
        },
        move |exit| {
            let _ = app_exit.emit("process://exit", exit);
        },
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn process_write_stdin(process_id: String, input: String) -> Result<(), String> {
    write_process_stdin(&process_id, &input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn process_kill(process_id: String) -> Result<(), String> {
    kill_process(&process_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_list() -> Result<Vec<Task>, XCoreError> {
    let tasks = if let Some(workspace_root) = get_workspace() {
        load_tasks_config(&workspace_root).tasks
    } else {
        load_tasks_config(std::path::Path::new("")).tasks
    };
    Ok(tasks)
}

#[tauri::command]
pub fn task_get(task_id: String) -> Result<Task, XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    let config = load_tasks_config(&workspace_root);
    config
        .tasks
        .into_iter()
        .find(|t| t.id == task_id)
        .ok_or(XCoreError::TaskNotFound(task_id))
}

#[tauri::command]
pub async fn task_run(
    app: tauri::AppHandle,
    task_id: String,
    allow_untrusted: Option<bool>,
) -> Result<String, XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    let allow = allow_untrusted.unwrap_or(false);

    let app_start = app.clone();
    let app_out = app.clone();
    let app_prob = app.clone();
    let app_done = app.clone();

    run_task_by_id(
        workspace_root,
        task_id,
        allow,
        move |start_exec| {
            let _ = app_start.emit("task://started", start_exec);
        },
        move |exec_id, chunk_text| {
            let _ = app_out.emit("task://output", serde_json::json!({
                "execution_id": exec_id,
                "data": chunk_text
            }));
        },
        move |problem| {
            let _ = app_prob.emit("task://problem", problem);
        },
        move |done_exec| {
            let _ = app_done.emit("task://completed", done_exec);
        },
    )
    .await
}

#[tauri::command]
pub async fn task_build(
    app: tauri::AppHandle,
    allow_untrusted: Option<bool>,
) -> Result<String, XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    let allow = allow_untrusted.unwrap_or(false);

    let app_start = app.clone();
    let app_out = app.clone();
    let app_prob = app.clone();
    let app_done = app.clone();

    run_task_by_type(
        workspace_root,
        TaskType::Build,
        allow,
        move |start_exec| {
            let _ = app_start.emit("task://started", start_exec);
        },
        move |exec_id, chunk_text| {
            let _ = app_out.emit("task://output", serde_json::json!({
                "execution_id": exec_id,
                "data": chunk_text
            }));
        },
        move |problem| {
            let _ = app_prob.emit("task://problem", problem);
        },
        move |done_exec| {
            let _ = app_done.emit("task://completed", done_exec);
        },
    )
    .await
}

#[tauri::command]
pub async fn task_clean(
    app: tauri::AppHandle,
    allow_untrusted: Option<bool>,
) -> Result<String, XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    let allow = allow_untrusted.unwrap_or(false);

    let app_start = app.clone();
    let app_out = app.clone();
    let app_prob = app.clone();
    let app_done = app.clone();

    run_task_by_type(
        workspace_root,
        TaskType::Clean,
        allow,
        move |start_exec| {
            let _ = app_start.emit("task://started", start_exec);
        },
        move |exec_id, chunk_text| {
            let _ = app_out.emit("task://output", serde_json::json!({
                "execution_id": exec_id,
                "data": chunk_text
            }));
        },
        move |problem| {
            let _ = app_prob.emit("task://problem", problem);
        },
        move |done_exec| {
            let _ = app_done.emit("task://completed", done_exec);
        },
    )
    .await
}

#[tauri::command]
pub async fn task_test(
    app: tauri::AppHandle,
    allow_untrusted: Option<bool>,
) -> Result<String, XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    let allow = allow_untrusted.unwrap_or(false);

    let app_start = app.clone();
    let app_out = app.clone();
    let app_prob = app.clone();
    let app_done = app.clone();

    run_task_by_type(
        workspace_root,
        TaskType::Test,
        allow,
        move |start_exec| {
            let _ = app_start.emit("task://started", start_exec);
        },
        move |exec_id, chunk_text| {
            let _ = app_out.emit("task://output", serde_json::json!({
                "execution_id": exec_id,
                "data": chunk_text
            }));
        },
        move |problem| {
            let _ = app_prob.emit("task://problem", problem);
        },
        move |done_exec| {
            let _ = app_done.emit("task://completed", done_exec);
        },
    )
    .await
}

#[tauri::command]
pub async fn task_cancel(execution_id: String) -> Result<(), XCoreError> {
    cancel_task_execution(&execution_id).await
}

#[tauri::command]
pub fn task_clear_history() -> Result<(), XCoreError> {
    clear_task_history();
    Ok(())
}

#[tauri::command]
pub fn task_history() -> Result<Vec<TaskExecution>, XCoreError> {
    let state_arc = get_task_runner_state();
    let state = state_arc.lock().unwrap();
    Ok(state.execution_history.clone())
}

#[tauri::command]
pub fn task_trust_set(trusted: bool) -> Result<(), XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    set_workspace_trust(&workspace_root, trusted);
    Ok(())
}

#[tauri::command]
pub fn task_trust_get() -> Result<WorkspaceTrustState, XCoreError> {
    let trust = if let Some(workspace_root) = get_workspace() {
        get_workspace_trust(&workspace_root)
    } else {
        WorkspaceTrustState::Untrusted
    };
    Ok(trust)
}

// Toolchain Commands
#[tauri::command]
pub fn toolchain_list_installed() -> Result<Vec<ToolchainManifest>, XCoreError> {
    let reg_arc = get_toolchain_registry();
    let reg = reg_arc.lock().unwrap();
    Ok(reg.list_installed_toolchains())
}

#[tauri::command]
pub fn toolchain_list_available() -> Result<Vec<ToolchainManifest>, XCoreError> {
    let reg_arc = get_toolchain_registry();
    let reg = reg_arc.lock().unwrap();
    Ok(reg.list_available_toolchains())
}

#[tauri::command]
pub fn toolchain_detect() -> Result<Vec<ToolchainManifest>, XCoreError> {
    let reg_arc = get_toolchain_registry();
    let mut reg = reg_arc.lock().unwrap();
    reg.scan_and_register_system_toolchains();
    Ok(reg.list_installed_toolchains())
}

#[tauri::command]
pub fn toolchain_get_active() -> Result<Vec<ToolchainManifest>, XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    Ok(resolve_active_project_toolchains(&workspace_root))
}

#[tauri::command]
pub async fn toolchain_install(
    app: tauri::AppHandle,
    manifest: ToolchainManifest,
    scope: String,
    allow_untrusted: Option<bool>,
) -> Result<ToolchainManifest, XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    validate_toolchain_authorization(&workspace_root, allow_untrusted.unwrap_or(false))
        .map_err(|e| XCoreError::SecurityError(e.to_string()))?;

    let target_scope = match scope.as_str() {
        "user" => ToolchainScope::User,
        _ => ToolchainScope::Global,
    };

    let app_prog = app.clone();
    let installed_manifest = download_and_install_toolchain(manifest, target_scope, move |progress| {
        let _ = app_prog.emit("toolchain://progress", progress);
    })
    .await?;

    let _ = app.emit("toolchain://completed", installed_manifest.clone());
    Ok(installed_manifest)
}

#[tauri::command]
pub fn toolchain_uninstall(id: String) -> Result<(), XCoreError> {
    let reg_arc = get_toolchain_registry();
    let mut reg = reg_arc.lock().unwrap();
    reg.remove_installed_toolchain(&id)
}

#[tauri::command]
pub fn toolchain_set_project(
    requirement: ProjectToolchainRequirement,
    allow_untrusted: Option<bool>,
) -> Result<(), XCoreError> {
    let workspace_root = get_workspace().ok_or(XCoreError::WorkspaceNotOpen)?;
    validate_toolchain_authorization(&workspace_root, allow_untrusted.unwrap_or(false))
        .map_err(|e| XCoreError::SecurityError(e.to_string()))?;

    let mut config = load_project_toolchain_config(&workspace_root);
    config.toolchains.retain(|t| !t.language.eq_ignore_ascii_case(&requirement.language));
    config.toolchains.push(requirement);

    save_project_toolchain_config(&workspace_root, &config).map_err(XCoreError::Io)
}

#[tauri::command]
pub fn settings_get() -> Result<AppSettings, XCoreError> {
    Ok(AppSettings::default())
}

#[tauri::command]
pub fn settings_update(_theme: String) -> Result<(), XCoreError> {
    Ok(())
}
