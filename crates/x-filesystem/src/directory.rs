use std::fs;
use std::path::Path;
use std::io;

#[derive(Debug, serde::Serialize)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn list_directory(path: &Path) -> io::Result<Vec<DirectoryEntry>> {
    let mut entries = Vec::new();
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let path_buf = entry.path();
            entries.push(DirectoryEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: path_buf.to_string_lossy().into_owned(),
                is_dir: path_buf.is_dir(),
            });
        }
    }
    // Sort directories first, then files
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_directory() {
        let temp_dir = std::env::temp_dir().join("x_editor_dir_test");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let sub_dir = temp_dir.join("subdir");
        fs::create_dir_all(&sub_dir).unwrap();

        let file_path = temp_dir.join("file.txt");
        fs::write(&file_path, "test").unwrap();

        let entries = list_directory(&temp_dir).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir); // Directories sorted first
        assert_eq!(entries[0].name, "subdir");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
