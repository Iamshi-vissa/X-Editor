use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::io;
use crate::paths::validate_path_in_workspace;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum WorkspaceTrustState {
    Trusted,
    Untrusted,
}

static TRUSTED_WORKSPACES: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();

fn get_trusted_set() -> &'static Mutex<HashSet<PathBuf>> {
    TRUSTED_WORKSPACES.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn set_workspace_trust(workspace_root: &Path, trusted: bool) {
    if let Ok(canonical) = workspace_root.canonicalize() {
        let mut set = get_trusted_set().lock().unwrap();
        if trusted {
            set.insert(canonical);
        } else {
            set.remove(&canonical);
        }
    }
}

pub fn get_workspace_trust(workspace_root: &Path) -> WorkspaceTrustState {
    if let Ok(canonical) = workspace_root.canonicalize() {
        let set = get_trusted_set().lock().unwrap();
        if set.contains(&canonical) {
            return WorkspaceTrustState::Trusted;
        }
    }
    WorkspaceTrustState::Untrusted
}

pub fn validate_task_authorization(
    workspace_root: &Path,
    target_cwd: &Path,
    allow_untrusted_override: bool,
) -> io::Result<PathBuf> {
    let valid_cwd = validate_path_in_workspace(workspace_root, target_cwd)?;

    let trust = get_workspace_trust(workspace_root);
    if trust == WorkspaceTrustState::Untrusted && !allow_untrusted_override {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Execution blocked: Workspace is untrusted and task execution requires explicit user authorization",
        ));
    }

    Ok(valid_cwd)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_workspace_trust_flow() {
        let temp_dir = std::env::temp_dir().join("x_editor_trust_test");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        assert_eq!(get_workspace_trust(&temp_dir), WorkspaceTrustState::Untrusted);

        set_workspace_trust(&temp_dir, true);
        assert_eq!(get_workspace_trust(&temp_dir), WorkspaceTrustState::Trusted);

        let res = validate_task_authorization(&temp_dir, &temp_dir, false);
        assert!(res.is_ok());

        set_workspace_trust(&temp_dir, false);
        let res_blocked = validate_task_authorization(&temp_dir, &temp_dir, false);
        assert!(res_blocked.is_err());

        let res_override = validate_task_authorization(&temp_dir, &temp_dir, true);
        assert!(res_override.is_ok());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
