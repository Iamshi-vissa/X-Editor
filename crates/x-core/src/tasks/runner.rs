use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use x_process::process_manager::{spawn_process_with_env, kill_process};
use x_security::trust::validate_task_authorization;
use crate::tasks::model::{TaskState, TaskExecution, TaskType};
use crate::tasks::config::load_tasks_config;
use crate::tasks::resolver::resolve_task_dependencies;
use crate::tasks::problem_matcher::{parse_compiler_output, Problem};
use crate::tasks::variables::substitute_task_variables;
use crate::toolchains::resolver::resolve_active_project_toolchains;
use crate::toolchains::environment::ResolvedToolchainEnvironment;
use crate::errors::XCoreError;

pub struct TaskRunnerState {
    pub active_executions: HashMap<String, TaskExecution>,
    pub execution_history: Vec<TaskExecution>,
    pub problems: Vec<Problem>,
}

static TASK_RUNNER_STATE: OnceLock<Arc<Mutex<TaskRunnerState>>> = OnceLock::new();

pub fn get_task_runner_state() -> &'static Arc<Mutex<TaskRunnerState>> {
    TASK_RUNNER_STATE.get_or_init(|| {
        Arc::new(Mutex::new(TaskRunnerState {
            active_executions: HashMap::new(),
            execution_history: Vec::new(),
            problems: Vec::new(),
        }))
    })
}

pub fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn clear_task_history() {
    let state_arc = get_task_runner_state();
    let mut state = state_arc.lock().unwrap();
    state.execution_history.clear();
    state.problems.clear();
}

pub async fn run_task_by_id<FStart, FOut, FProb, FDone>(
    workspace_root: PathBuf,
    task_id: String,
    allow_untrusted: bool,
    on_start: FStart,
    on_output: FOut,
    on_problem: FProb,
    on_done: FDone,
) -> Result<String, XCoreError>
where
    FStart: Fn(TaskExecution) + Send + Sync + 'static,
    FOut: Fn(String, String) + Send + Sync + 'static,
    FProb: Fn(Problem) + Send + Sync + 'static,
    FDone: Fn(TaskExecution) + Send + Sync + 'static,
{
    let config = load_tasks_config(&workspace_root);
    let resolved_tasks = resolve_task_dependencies(&task_id, &config.tasks)?;

    // Resolve toolchain environment for process execution
    let toolchains = resolve_active_project_toolchains(&workspace_root);
    let toolchain_env = ResolvedToolchainEnvironment::build(&toolchains);

    let execution_id = format!("exec_{}_{}", task_id, current_timestamp_ms());

    let on_start_cb = Arc::new(on_start);
    let on_out_cb = Arc::new(on_output);
    let on_prob_cb = Arc::new(on_problem);
    let on_done_cb = Arc::new(on_done);

    for task in resolved_tasks {
        let raw_cwd = task
            .working_directory
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| workspace_root.clone());

        let valid_cwd = validate_task_authorization(&workspace_root, &raw_cwd, allow_untrusted)
            .map_err(|e| XCoreError::SecurityError(e.to_string()))?;

        // Variable substitution for command & args
        let tc_root = toolchains.first().and_then(|t| t.installation_path.as_deref()).map(Path::new);
        let substituted_cmd = substitute_task_variables(&task.command, &workspace_root, None, tc_root);
        let substituted_args: Vec<String> = task
            .args
            .iter()
            .map(|a| substitute_task_variables(a, &workspace_root, None, tc_root))
            .collect();

        // Environment precedence: Base System -> Toolchain Environment -> Task Environment
        let mut final_env = HashMap::new();
        for (k, v) in &toolchain_env.env_map {
            final_env.insert(k.clone(), v.clone());
        }
        for (k, v) in &task.environment {
            let sub_v = substitute_task_variables(v, &workspace_root, None, tc_root);
            final_env.insert(k.clone(), sub_v);
        }

        let now = current_timestamp_ms();
        let mut execution = TaskExecution {
            execution_id: execution_id.clone(),
            task_id: task.id.clone(),
            task_name: task.name.clone(),
            process_id: Some(execution_id.clone()),
            status: TaskState::Running,
            started_at: now,
            completed_at: None,
            duration_ms: None,
            exit_code: None,
            output_summary: None,
        };

        {
            let state_arc = get_task_runner_state();
            let mut state = state_arc.lock().unwrap();
            state.active_executions.insert(execution_id.clone(), execution.clone());
        }

        on_start_cb(execution.clone());

        let output_buffer = Arc::new(Mutex::new(String::new()));
        let out_buf_clone = output_buffer.clone();
        let err_buf_clone = output_buffer.clone();
        let exec_id_out = execution_id.clone();
        let exec_id_err = execution_id.clone();

        let cb_out = on_out_cb.clone();
        let cb_err = on_out_cb.clone();

        let process_res = spawn_process_with_env(
            execution_id.clone(),
            substituted_cmd,
            substituted_args,
            valid_cwd,
            Some(final_env),
            move |chunk| {
                {
                    let mut b = out_buf_clone.lock().unwrap();
                    b.push_str(&chunk.data);
                }
                cb_out(exec_id_out.clone(), chunk.data);
            },
            move |chunk| {
                {
                    let mut b = err_buf_clone.lock().unwrap();
                    b.push_str(&chunk.data);
                }
                cb_err(exec_id_err.clone(), chunk.data);
            },
            move |_exit| {},
        )
        .await;

        if let Err(e) = process_res {
            execution.status = TaskState::Failed;
            execution.completed_at = Some(current_timestamp_ms());
            execution.duration_ms = Some(execution.completed_at.unwrap() - execution.started_at);
            execution.output_summary = Some(format!("Task failed to spawn: {}", e));

            {
                let state_arc = get_task_runner_state();
                let mut state = state_arc.lock().unwrap();
                state.active_executions.remove(&execution_id);
                state.execution_history.push(execution.clone());
            }

            on_done_cb(execution);
            return Err(XCoreError::ProcessFailed(e.to_string()));
        }

        // Wait for process completion
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            let active = {
                let state_arc = get_task_runner_state();
                let state = state_arc.lock().unwrap();
                state.active_executions.contains_key(&execution_id)
            };
            if !active {
                break;
            }
        }

        // Parse compiler problems from output buffer
        let full_output = {
            let b = output_buffer.lock().unwrap();
            b.clone()
        };

        let parsed_problems = parse_compiler_output(&full_output, &task.name);
        {
            let state_arc = get_task_runner_state();
            let mut state = state_arc.lock().unwrap();
            for p in &parsed_problems {
                state.problems.push(p.clone());
                on_prob_cb(p.clone());
            }
        }

        let completed_time = current_timestamp_ms();
        execution.status = TaskState::Succeeded;
        execution.completed_at = Some(completed_time);
        execution.duration_ms = Some(completed_time - execution.started_at);
        execution.exit_code = Some(0);

        {
            let state_arc = get_task_runner_state();
            let mut state = state_arc.lock().unwrap();
            state.active_executions.remove(&execution_id);
            state.execution_history.push(execution.clone());
        }

        on_done_cb(execution);
    }

    Ok(execution_id)
}

pub async fn run_task_by_type<FStart, FOut, FProb, FDone>(
    workspace_root: PathBuf,
    task_type: TaskType,
    allow_untrusted: bool,
    on_start: FStart,
    on_output: FOut,
    on_problem: FProb,
    on_done: FDone,
) -> Result<String, XCoreError>
where
    FStart: Fn(TaskExecution) + Send + Sync + 'static,
    FOut: Fn(String, String) + Send + Sync + 'static,
    FProb: Fn(Problem) + Send + Sync + 'static,
    FDone: Fn(TaskExecution) + Send + Sync + 'static,
{
    let config = load_tasks_config(&workspace_root);
    let target_task = config
        .tasks
        .iter()
        .find(|t| t.task_type == task_type)
        .ok_or_else(|| XCoreError::TaskNotFound(format!("No task found for type {:?}", task_type)))?;

    run_task_by_id(
        workspace_root,
        target_task.id.clone(),
        allow_untrusted,
        on_start,
        on_output,
        on_problem,
        on_done,
    )
    .await
}

pub async fn cancel_task_execution(execution_id: &str) -> Result<(), XCoreError> {
    let _ = kill_process(execution_id).await;

    let state_arc = get_task_runner_state();
    let mut state = state_arc.lock().unwrap();
    if let Some(mut exec) = state.active_executions.remove(execution_id) {
        let now = current_timestamp_ms();
        exec.status = TaskState::Cancelled;
        exec.completed_at = Some(now);
        exec.duration_ms = Some(now - exec.started_at);
        state.execution_history.push(exec);
        Ok(())
    } else {
        Err(XCoreError::TaskNotFound(execution_id.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[tokio::test]
    async fn test_untrusted_workspace_task_restriction() {
        let temp_dir = std::env::temp_dir().join("x_editor_task_untrusted_test");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        // Workspace trust is Untrusted by default
        let res = run_task_by_id(
            temp_dir.clone(),
            "build".to_string(),
            false,
            |_| {},
            |_, _| {},
            |_| {},
            |_| {},
        )
        .await;

        assert!(res.is_err());
        match res.unwrap_err() {
            XCoreError::SecurityError(msg) => {
                assert!(msg.contains("PermissionDenied") || msg.contains("untrusted"));
            }
            _ => panic!("Expected SecurityError for untrusted workspace"),
        }

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
