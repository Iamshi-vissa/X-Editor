use super::blocking;
use crate::state::AppState;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use xe_runtime::run::RunPlan;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeReport {
    installed: Vec<xe_runtime::detect::InstalledRuntime>,
    requirements: Vec<RequirementStatus>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementStatus {
    #[serde(flatten)]
    requirement: xe_runtime::detect::Requirement,
    installed_version: Option<String>,
    /// true / false, or null when the requirement can't be checked automatically
    satisfied: Option<bool>,
}

#[tauri::command]
pub async fn runtime_report(app: AppHandle) -> Result<RuntimeReport, String> {
    let root = app.state::<AppState>().workspace.read().clone();
    blocking(move || {
        let installed = xe_runtime::detect::detect_installed();
        let reqs = root.map(|r| xe_runtime::detect::project_requirements(&r)).unwrap_or_default();
        let requirements = reqs
            .into_iter()
            .map(|r| {
                let inst = installed.iter().find(|i| i.id == r.runtime).and_then(|i| i.version.clone());
                let satisfied = match &inst {
                    Some(v) => xe_runtime::detect::satisfies(v, &r.requested),
                    None => Some(false),
                };
                RequirementStatus { requirement: r, installed_version: inst, satisfied }
            })
            .collect();
        Ok(RuntimeReport { installed, requirements })
    })
    .await
}

#[tauri::command]
pub fn run_plan_file(app: AppHandle, path: String, shell_kind: String) -> Result<Option<RunPlan>, String> {
    let state = app.state::<AppState>();
    let p = state.guard(&path)?;
    let out_dir = std::env::temp_dir().join("x-editor-run");
    let _ = std::fs::create_dir_all(&out_dir);
    Ok(xe_runtime::run::plan_file(&p, &out_dir, &shell_kind))
}

#[tauri::command]
pub fn run_plan_project(app: AppHandle, shell_kind: String) -> Result<Option<RunPlan>, String> {
    let root = app.state::<AppState>().workspace()?;
    Ok(xe_runtime::run::plan_project(&root, &shell_kind))
}

#[tauri::command]
pub fn shell_quote(arg: String, shell_kind: String) -> String {
    xe_runtime::run::quote(&arg, &shell_kind)
}
