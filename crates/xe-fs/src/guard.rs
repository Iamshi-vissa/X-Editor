use crate::{FsError, Result};
use std::path::{Component, Path, PathBuf};

/// Resolves `target` to an absolute, normalised path and checks that it lives inside
/// one of `roots`. Works for paths that don't exist yet (new files): the deepest
/// existing ancestor is canonicalised and the remaining components are appended.
pub fn resolve_within(roots: &[PathBuf], target: &Path) -> Result<PathBuf> {
    let resolved = canonicalize_lenient(target)?;
    for root in roots {
        if let Ok(root) = root.canonicalize() {
            if resolved.starts_with(&root) {
                return Ok(resolved);
            }
        }
    }
    Err(FsError::OutsideWorkspace(target.display().to_string()))
}

/// Canonicalises a path that may not exist yet. Rejects `..` in the part that
/// doesn't exist, so a new path can't climb out of its parent.
pub fn canonicalize_lenient(target: &Path) -> Result<PathBuf> {
    if let Ok(p) = target.canonicalize() {
        return Ok(p);
    }
    let mut existing = target.to_path_buf();
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if existing.exists() {
            break;
        }
        match existing.file_name() {
            Some(name) => rest.push(name.to_os_string()),
            None => return Err(FsError::Other(format!("invalid path: {}", target.display()))),
        }
        if !existing.pop() {
            return Err(FsError::Other(format!("invalid path: {}", target.display())));
        }
    }
    let mut out = existing.canonicalize()?;
    for part in rest.iter().rev() {
        let comp = Path::new(part).components().next();
        match comp {
            Some(Component::Normal(_)) => out.push(part),
            _ => return Err(FsError::OutsideWorkspace(target.display().to_string())),
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_paths_inside_and_new_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        std::fs::write(root.join("a.txt"), "x").unwrap();
        assert!(resolve_within(&[root.clone()], &root.join("a.txt")).is_ok());
        assert!(resolve_within(&[root.clone()], &root.join("new/dir/b.txt")).is_ok());
    }

    #[test]
    fn rejects_traversal_and_outside_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("ws");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(dir.path().join("secret.txt"), "x").unwrap();
        assert!(resolve_within(&[root.clone()], &root.join("../secret.txt")).is_err());
        assert!(resolve_within(&[root.clone()], &root.join("missing/../../secret.txt")).is_err());
        assert!(resolve_within(&[root.clone()], &dir.path().join("secret.txt")).is_err());
    }
}
