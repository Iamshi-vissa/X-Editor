use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use x_process::process_manager::{spawn_process, kill_process};
use x_security::trust::validate_task_authorization;
use crate::tasks::model::{TaskState, TaskExecution};
use crate::tasks::config::load_tasks_config;
use crate::tasks::resolver::resolve_task_dependencies;
use crate::tasks::problem_matcher::{parse_compiler_output, Problem};
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

    let execution_id = format!("exec_{}_{}", task_id, current_timestamp_ms());

    let on_start_cb = Arc::new(on_start);
    let on_out_cb = Arc::new(on_output);
    let on_prob_cb = Arc::new(on_problem);
    let on_done_cb = Arc::new(on_done);

    for task in resolved_tasks {
        let task_cwd = task
            .working_directory
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| workspace_root.clone());

        let valid_cwd = validate_task_authorization(&workspace_root, &task_cwd, allow_untrusted)
            .map_err(|e| XCoreError::SecurityError(e.to_string()))?;

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

        let process_res = spawn_process(
            execution_id.clone(),
            task.command.clone(),
            task.args.clone(),
            valid_cwd,
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
