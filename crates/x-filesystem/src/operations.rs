use std::fs;
use std::path::Path;
use std::io;

pub fn create_file(path: &Path, content: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(path, content)
}

pub fn create_directory(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)
}

pub fn rename_path(old_path: &Path, new_path: &Path) -> io::Result<()> {
    if let Some(parent) = new_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::rename(old_path, new_path)
}

pub fn delete_path(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filesystem_operations() {
        let temp_dir = std::env::temp_dir().join("x_editor_ops_test");
        let _ = fs::remove_dir_all(&temp_dir);

        let sub_dir = temp_dir.join("nested/dir");
        create_directory(&sub_dir).unwrap();
        assert!(sub_dir.exists());

        let file_path = sub_dir.join("test.txt");
        create_file(&file_path, "sample text").unwrap();
        assert!(file_path.exists());

        let renamed_path = sub_dir.join("renamed.txt");
        rename_path(&file_path, &renamed_path).unwrap();
        assert!(!file_path.exists());
        assert!(renamed_path.exists());

        delete_path(&temp_dir).unwrap();
        assert!(!temp_dir.exists());
    }
}
