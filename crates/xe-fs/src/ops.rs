use crate::{FsError, Result};
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::Path;

const MAX_OPEN_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
}

/// Lists one directory level, folders first, then files, both case-insensitively sorted.
pub fn list_dir(path: &Path) -> Result<Vec<DirEntry>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".git" {
            continue;
        }
        let ft = entry.file_type()?;
        let is_symlink = ft.is_symlink();
        let is_dir = if is_symlink {
            entry.path().is_dir()
        } else {
            ft.is_dir()
        };
        out.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            is_symlink,
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub text: String,
    /// "\n" or "\r\n", detected from the first line break.
    pub eol: String,
    pub size: u64,
}

pub fn read_text(path: &Path) -> Result<FileContent> {
    let meta = fs::metadata(path)?;
    if meta.len() > MAX_OPEN_BYTES {
        return Err(FsError::TooLarge(
            meta.len() / 1_048_576,
            MAX_OPEN_BYTES / 1_048_576,
        ));
    }
    let bytes = fs::read(path)?;
    let probe = &bytes[..bytes.len().min(8192)];
    if probe.contains(&0) {
        return Err(FsError::Binary);
    }
    let mut text = match String::from_utf8(bytes) {
        Ok(t) => t,
        Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
    };
    if text.starts_with('\u{feff}') {
        text.remove(0);
    }
    let eol = match text.find('\n') {
        Some(i) if i > 0 && text.as_bytes()[i - 1] == b'\r' => "\r\n",
        _ => "\n",
    };
    Ok(FileContent {
        text,
        eol: eol.to_string(),
        size: meta.len(),
    })
}

/// Writes through a temporary file in the same folder and renames it over the target,
/// so a crash mid-save never leaves a half-written file behind.
pub fn write_text_atomic(path: &Path, text: &str) -> Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| FsError::Other("file has no parent folder".into()))?;
    fs::create_dir_all(dir)?;
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let tmp = dir.join(format!(".{file_name}.xe-tmp"));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
    }
    if let Ok(meta) = fs::metadata(path) {
        let _ = fs::set_permissions(&tmp, meta.permissions());
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

pub fn create_file(path: &Path) -> Result<()> {
    if path.exists() {
        return Err(FsError::Other(format!("{} already exists", path.display())));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::File::create(path)?;
    Ok(())
}

pub fn create_dir(path: &Path) -> Result<()> {
    if path.exists() {
        return Err(FsError::Other(format!("{} already exists", path.display())));
    }
    fs::create_dir_all(path)?;
    Ok(())
}

pub fn rename(from: &Path, to: &Path) -> Result<()> {
    if to.exists() {
        return Err(FsError::Other(format!("{} already exists", to.display())));
    }
    fs::rename(from, to)?;
    Ok(())
}

/// Moves to the OS trash / recycle bin so deletes can be undone.
pub fn delete_to_trash(path: &Path) -> Result<()> {
    trash::delete(path).map_err(|e| FsError::Other(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_round_trip_and_eol() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.txt");
        write_text_atomic(&p, "one\r\ntwo").unwrap();
        let c = read_text(&p).unwrap();
        assert_eq!(c.text, "one\r\ntwo");
        assert_eq!(c.eol, "\r\n");
        assert!(!dir.path().join(".a.txt.xe-tmp").exists());
    }

    #[test]
    fn binary_files_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("b.bin");
        fs::write(&p, [0u8, 1, 2, 3]).unwrap();
        assert!(matches!(read_text(&p), Err(FsError::Binary)));
    }

    #[test]
    fn listing_puts_folders_first() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.txt"), "").unwrap();
        fs::create_dir(dir.path().join("z")).unwrap();
        fs::write(dir.path().join("A.txt"), "").unwrap();
        let names: Vec<_> = list_dir(dir.path())
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, vec!["z", "A.txt", "b.txt"]);
    }
}
