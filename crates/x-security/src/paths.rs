use std::path::{Path, PathBuf};
use std::io;

pub fn validate_path_in_workspace(workspace_root: &Path, target_path: &Path) -> io::Result<PathBuf> {
    let canonical_root = workspace_root.canonicalize()?;
    
    let canonical_target = if target_path.exists() {
        target_path.canonicalize()?
    } else {
        let parent = target_path.parent().unwrap_or(Path::new(""));
        let canonical_parent = parent.canonicalize()?;
        canonical_parent.join(target_path.file_name().unwrap_or_default())
    };

    if canonical_target.starts_with(&canonical_root) {
        Ok(canonical_target)
    } else {
        Err(io::Error::new(io::ErrorKind::PermissionDenied, "Path is outside the workspace"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_valid_path_in_workspace() {
        let temp_dir = std::env::temp_dir().join("x_editor_test_security_valid");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let test_file = temp_dir.join("test.txt");
        fs::write(&test_file, "hello").unwrap();

        let res = validate_path_in_workspace(&temp_dir, &test_file);
        assert!(res.is_ok());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_path_traversal_prevention() {
        let temp_dir = std::env::temp_dir().join("x_editor_test_security_invalid");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let outside_file = std::env::temp_dir().join("outside.txt");
        fs::write(&outside_file, "outside").unwrap();

        let res = validate_path_in_workspace(&temp_dir, &outside_file);
        assert!(res.is_err());

        let _ = fs::remove_file(&outside_file);
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
