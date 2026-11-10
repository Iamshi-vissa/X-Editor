//! User configuration on disk, as plain JSON the user can edit in the editor itself:
//!   <config>/x-editor/settings.json     preferences (theme, fonts, keybindings, ...)
//!   <config>/x-editor/state.json        session: recent folders, open tabs, layout
//!   <config>/x-editor/themes/*.json     custom themes
//! The UI owns the settings schema and defaults; this crate only stores JSON safely.

use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct ConfigStore {
    dir: PathBuf,
}

impl ConfigStore {
    pub fn new() -> Self {
        let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        Self::at(base.join("x-editor"))
    }

    pub fn at(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(dir.join("themes"));
        Self { dir }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn settings_path(&self) -> PathBuf {
        self.dir.join("settings.json")
    }

    pub fn state_path(&self) -> PathBuf {
        self.dir.join("state.json")
    }

    pub fn themes_dir(&self) -> PathBuf {
        self.dir.join("themes")
    }

    /// Reads settings. Accepts `//` line comments, since people annotate settings files.
    /// A broken file returns an error rather than silently resetting the user's settings.
    pub fn read_settings(&self) -> Result<Value, String> {
        read_json(&self.settings_path())
    }

    pub fn write_settings(&self, value: &Value) -> io::Result<()> {
        write_json(&self.settings_path(), value)
    }

    pub fn read_state(&self) -> Value {
        read_json(&self.state_path()).unwrap_or(Value::Object(Default::default()))
    }

    pub fn write_state(&self, value: &Value) -> io::Result<()> {
        write_json(&self.state_path(), value)
    }

    /// Every valid theme file in the themes folder; invalid ones are skipped.
    pub fn read_themes(&self) -> Vec<Value> {
        let Ok(entries) = fs::read_dir(self.themes_dir()) else { return vec![] };
        let mut out = Vec::new();
        for e in entries.flatten() {
            if e.path().extension().is_some_and(|x| x == "json") {
                if let Ok(v) = read_json(&e.path()) {
                    out.push(v);
                }
            }
        }
        out
    }
}

impl Default for ConfigStore {
    fn default() -> Self {
        Self::new()
    }
}

fn strip_line_comments(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        let mut in_str = false;
        let mut escaped = false;
        let mut cut = line.len();
        let bytes = line.as_bytes();
        for i in 0..bytes.len() {
            let c = bytes[i];
            if escaped {
                escaped = false;
                continue;
            }
            match c {
                b'\\' if in_str => escaped = true,
                b'"' => in_str = !in_str,
                b'/' if !in_str && i + 1 < bytes.len() && bytes[i + 1] == b'/' => {
                    cut = i;
                    break;
                }
                _ => {}
            }
        }
        out.push_str(&line[..cut]);
        out.push('\n');
    }
    out
}

fn read_json(path: &Path) -> Result<Value, String> {
    match fs::read_to_string(path) {
        Ok(t) if t.trim().is_empty() => Ok(Value::Object(Default::default())),
        Ok(t) => serde_json::from_str(&strip_line_comments(&t))
            .map_err(|e| format!("{} has an error on line {}: {}", path.display(), e.line(), e)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Value::Object(Default::default())),
        Err(e) => Err(e.to_string()),
    }
}

fn write_json(path: &Path, value: &Value) -> io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(value)? + "\n")?;
    fs::rename(tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip_with_comments() {
        let d = tempfile::tempdir().unwrap();
        let store = ConfigStore::at(d.path().to_path_buf());
        assert_eq!(store.read_settings().unwrap(), serde_json::json!({}));
        fs::write(store.settings_path(), "{\n // my font\n \"font\": \"a//b\" // trailing\n}").unwrap();
        assert_eq!(store.read_settings().unwrap(), serde_json::json!({"font": "a//b"}));
        fs::write(store.settings_path(), "{ broken").unwrap();
        assert!(store.read_settings().is_err());
        store.write_state(&serde_json::json!({"recent": ["/a"]})).unwrap();
        assert_eq!(store.read_state()["recent"][0], "/a");
    }
}
