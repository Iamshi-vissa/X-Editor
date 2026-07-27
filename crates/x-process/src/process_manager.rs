use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, Command};
use serde::{Deserialize, Serialize};
use crate::errors::ProcessError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessOutputChunk {
    pub process_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessExitPayload {
    pub process_id: String,
    pub code: Option<i32>,
}

pub struct ActiveProcess {
    pub id: String,
    pub stdin: Arc<tokio::sync::Mutex<Option<ChildStdin>>>,
    pub child_handle: Arc<tokio::sync::Mutex<Option<Child>>>,
}

static PROCESS_REGISTRY: OnceLock<Arc<Mutex<HashMap<String, ActiveProcess>>>> = OnceLock::new();

pub fn get_process_registry() -> &'static Arc<Mutex<HashMap<String, ActiveProcess>>> {
    PROCESS_REGISTRY.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

pub async fn spawn_process<FOut, FErr, FExit>(
    process_id: String,
    command_str: String,
    args: Vec<String>,
    cwd: PathBuf,
    on_stdout: FOut,
    on_stderr: FErr,
    on_exit: FExit,
) -> Result<String, ProcessError>
where
    FOut: Fn(ProcessOutputChunk) + Send + Sync + 'static,
    FErr: Fn(ProcessOutputChunk) + Send + Sync + 'static,
    FExit: Fn(ProcessExitPayload) + Send + Sync + 'static,
{
    spawn_process_with_env(
        process_id,
        command_str,
        args,
        cwd,
        None,
        on_stdout,
        on_stderr,
        on_exit,
    )
    .await
}

pub async fn spawn_process_with_env<FOut, FErr, FExit>(
    process_id: String,
    command_str: String,
    args: Vec<String>,
    cwd: PathBuf,
    env: Option<HashMap<String, String>>,
    on_stdout: FOut,
    on_stderr: FErr,
    on_exit: FExit,
) -> Result<String, ProcessError>
where
    FOut: Fn(ProcessOutputChunk) + Send + Sync + 'static,
    FErr: Fn(ProcessOutputChunk) + Send + Sync + 'static,
    FExit: Fn(ProcessExitPayload) + Send + Sync + 'static,
{
    let mut cmd = Command::new(&command_str);
    cmd.args(&args);
    cmd.current_dir(cwd);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::piped());

    if let Some(env_map) = env {
        cmd.envs(env_map);
    }

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd.spawn().map_err(|e| ProcessError::StartFailed(e.to_string()))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();

    let active_proc = ActiveProcess {
        id: process_id.clone(),
        stdin: Arc::new(tokio::sync::Mutex::new(stdin)),
        child_handle: Arc::new(tokio::sync::Mutex::new(Some(child))),
    };

    {
        let registry = get_process_registry();
        let mut map = registry.lock().unwrap();
        map.insert(process_id.clone(), active_proc);
    }

    let pid_stdout = process_id.clone();
    if let Some(mut out) = stdout {
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            loop {
                match out.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        on_stdout(ProcessOutputChunk {
                            process_id: pid_stdout.clone(),
                            data: text,
                        });
                    }
                    Err(_) => break,
                }
            }
        });
    }

    let pid_stderr = process_id.clone();
    if let Some(mut err) = stderr {
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            loop {
                match err.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        on_stderr(ProcessOutputChunk {
                            process_id: pid_stderr.clone(),
                            data: text,
                        });
                    }
                    Err(_) => break,
                }
            }
        });
    }

    let pid_exit = process_id.clone();
    let registry_arc = get_process_registry().clone();
    tokio::spawn(async move {
        let child_opt = {
            let map = registry_arc.lock().unwrap();
            map.get(&pid_exit).map(|p| p.child_handle.clone())
        };

        if let Some(child_mutex) = child_opt {
            let mut guard = child_mutex.lock().await;
            if let Some(mut child) = guard.take() {
                match child.wait().await {
                    Ok(status) => {
                        on_exit(ProcessExitPayload {
                            process_id: pid_exit.clone(),
                            code: status.code(),
                        });
                    }
                    Err(_) => {
                        on_exit(ProcessExitPayload {
                            process_id: pid_exit.clone(),
                            code: None,
                        });
                    }
                }
            }
        }

        let mut map = registry_arc.lock().unwrap();
        map.remove(&pid_exit);
    });

    Ok(process_id)
}

pub async fn write_process_stdin(process_id: &str, input: &str) -> Result<(), ProcessError> {
    let stdin_opt = {
        let registry = get_process_registry();
        let map = registry.lock().unwrap();
        map.get(process_id).map(|p| p.stdin.clone())
    };

    if let Some(stdin_mutex) = stdin_opt {
        let mut guard = stdin_mutex.lock().await;
        if let Some(stdin) = guard.as_mut() {
            stdin.write_all(input.as_bytes()).await.map_err(ProcessError::Io)?;
            stdin.flush().await.map_err(ProcessError::Io)?;
            return Ok(());
        }
    }
    Err(ProcessError::ProcessNotFound(process_id.to_string()))
}

pub async fn kill_process_tree(process_id: &str) -> Result<(), ProcessError> {
    let child_opt = {
        let registry = get_process_registry();
        let mut map = registry.lock().unwrap();
        map.remove(process_id).map(|p| p.child_handle)
    };

    if let Some(child_mutex) = child_opt {
        let mut guard = child_mutex.lock().await;
        if let Some(mut child) = guard.take() {
            let pid = child.id();
            if let Some(pid_num) = pid {
                #[cfg(windows)]
                {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/T", "/PID", &pid_num.to_string()])
                        .output();
                }
                #[cfg(unix)]
                {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &format!("-{}", pid_num)])
                        .output();
                }
            }
            let _ = child.kill().await;
            return Ok(());
        }
    }
    Err(ProcessError::ProcessNotFound(process_id.to_string()))
}

pub async fn kill_process(process_id: &str) -> Result<(), ProcessError> {
    kill_process_tree(process_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_spawn_and_kill_process_tree() {
        #[cfg(windows)]
        let (cmd, args) = ("cmd.exe".to_string(), vec!["/C".to_string(), "ping 127.0.0.1 -n 20".to_string()]);
        #[cfg(not(windows))]
        let (cmd, args) = ("sleep".to_string(), vec!["20".to_string()]);

        let res = spawn_process(
            "test_p_tree".to_string(),
            cmd,
            args,
            std::env::temp_dir(),
            |_chunk| {},
            |_chunk| {},
            |_exit| {},
        ).await;

        assert!(res.is_ok());

        // Call kill_process_tree immediately while process is active in registry
        let kill_res = kill_process_tree("test_p_tree").await;
        assert!(kill_res.is_ok());
    }
}
