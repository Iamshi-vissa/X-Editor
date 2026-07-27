use std::path::Path;
use crate::tasks::model::{Task, TaskType};

pub trait BuildSystemAdapter: Send + Sync {
    fn identify(&self) -> &'static str;
    fn detect(&self, workspace_root: &Path) -> bool;
    fn generate_task(&self, workspace_root: &Path) -> Option<Task>;
}

pub struct CppDirectAdapter;
impl BuildSystemAdapter for CppDirectAdapter {
    fn identify(&self) -> &'static str {
        "cpp-direct"
    }

    fn detect(&self, workspace_root: &Path) -> bool {
        workspace_root.join("src").join("main.cpp").exists()
            || workspace_root.join("main.cpp").exists()
    }

    fn generate_task(&self, _workspace_root: &Path) -> Option<Task> {
        Some(Task {
            id: "build_cpp_direct".to_string(),
            name: "Build C++ Project".to_string(),
            task_type: TaskType::Build,
            command: if cfg!(windows) { "g++.exe".to_string() } else { "g++".to_string() },
            args: vec!["-g".to_string(), "src/main.cpp".to_string(), "-o".to_string(), "build/app".to_string()],
            working_directory: None,
            environment: Default::default(),
            depends_on: vec![],
            problem_matcher: Some("gcc".to_string()),
            group: Some("build".to_string()),
        })
    }
}

pub struct RustCargoAdapter;
impl BuildSystemAdapter for RustCargoAdapter {
    fn identify(&self) -> &'static str {
        "rust-cargo"
    }

    fn detect(&self, workspace_root: &Path) -> bool {
        workspace_root.join("Cargo.toml").exists()
    }

    fn generate_task(&self, _workspace_root: &Path) -> Option<Task> {
        Some(Task {
            id: "build_cargo".to_string(),
            name: "Cargo Build".to_string(),
            task_type: TaskType::Build,
            command: if cfg!(windows) { "cargo.exe".to_string() } else { "cargo".to_string() },
            args: vec!["build".to_string()],
            working_directory: None,
            environment: Default::default(),
            depends_on: vec![],
            problem_matcher: Some("rust".to_string()),
            group: Some("build".to_string()),
        })
    }
}

pub fn detect_build_systems(workspace_root: &Path) -> Vec<Task> {
    let adapters: Vec<Box<dyn BuildSystemAdapter>> = vec![
        Box::new(RustCargoAdapter),
        Box::new(CppDirectAdapter),
    ];

    let mut generated = Vec::new();
    for adapter in adapters {
        if adapter.detect(workspace_root) {
            if let Some(task) = adapter.generate_task(workspace_root) {
                generated.push(task);
            }
        }
    }
    generated
}
