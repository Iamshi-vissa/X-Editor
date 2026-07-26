use std::fs;
use std::path::Path;
use crate::tasks::model::{TaskConfig, Task, TaskType};

pub fn load_tasks_config(workspace_root: &Path) -> TaskConfig {
    let config_path = workspace_root.join(".x-editor").join("tasks.json");
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<TaskConfig>(&content) {
                return config;
            }
        }
    }

    // Default fallback task set if .x-editor/tasks.json does not exist
    TaskConfig {
        version: 1,
        tasks: vec![
            Task {
                id: "build".to_string(),
                name: "Build Project".to_string(),
                task_type: TaskType::Build,
                command: if cfg!(windows) { "cmd.exe".to_string() } else { "sh".to_string() },
                args: if cfg!(windows) {
                    vec!["/C".to_string(), "echo [Build] Finished building workspace".to_string()]
                } else {
                    vec!["-c".to_string(), "echo [Build] Finished building workspace".to_string()]
                },
                working_directory: None,
                environment: Default::default(),
                depends_on: vec![],
                problem_matcher: Some("gcc".to_string()),
                group: Some("build".to_string()),
            },
            Task {
                id: "run".to_string(),
                name: "Run Project".to_string(),
                task_type: TaskType::Run,
                command: if cfg!(windows) { "cmd.exe".to_string() } else { "sh".to_string() },
                args: if cfg!(windows) {
                    vec!["/C".to_string(), "echo [Run] Running application...".to_string()]
                } else {
                    vec!["-c".to_string(), "echo [Run] Running application...".to_string()]
                },
                working_directory: None,
                environment: Default::default(),
                depends_on: vec!["build".to_string()],
                problem_matcher: None,
                group: Some("test".to_string()),
            },
            Task {
                id: "clean".to_string(),
                name: "Clean Workspace".to_string(),
                task_type: TaskType::Clean,
                command: if cfg!(windows) { "cmd.exe".to_string() } else { "sh".to_string() },
                args: if cfg!(windows) {
                    vec!["/C".to_string(), "echo [Clean] Workspace cleaned".to_string()]
                } else {
                    vec!["-c".to_string(), "echo [Clean] Workspace cleaned".to_string()]
                },
                working_directory: None,
                environment: Default::default(),
                depends_on: vec![],
                problem_matcher: None,
                group: None,
            },
        ],
    }
}

pub fn save_tasks_config(workspace_root: &Path, config: &TaskConfig) -> Result<(), String> {
    let dir = workspace_root.join(".x-editor");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(dir.join("tasks.json"), content).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_fallback_tasks() {
        let temp_dir = std::env::temp_dir().join("x_editor_config_test");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let config = load_tasks_config(&temp_dir);
        assert!(!config.tasks.is_empty());
        assert_eq!(config.tasks[0].id, "build");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
