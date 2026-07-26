use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;

pub struct WorkspaceState {
    pub root: Option<PathBuf>,
}

static WORKSPACE: OnceLock<Mutex<WorkspaceState>> = OnceLock::new();

pub fn get_workspace_state() -> &'static Mutex<WorkspaceState> {
    WORKSPACE.get_or_init(|| Mutex::new(WorkspaceState { root: None }))
}

pub fn set_workspace(path: PathBuf) {
    let mut state = get_workspace_state().lock().unwrap();
    state.root = Some(path);
}

pub fn get_workspace() -> Option<PathBuf> {
    let state = get_workspace_state().lock().unwrap();
    state.root.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_state() {
        let path = PathBuf::from("/test/path");
        set_workspace(path.clone());
        let current = get_workspace();
        assert_eq!(current, Some(path));
    }
}
