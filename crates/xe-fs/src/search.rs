use crate::{FsError, Result};
use ignore::WalkBuilder;
use parking_lot::Mutex;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// Lists every file in the workspace, respecting .gitignore, relative to `root`.
pub fn list_files(root: &Path, limit: usize) -> Vec<String> {
    let mut out = Vec::new();
    for entry in WalkBuilder::new(root)
        .hidden(false)
        .filter_entry(|e| e.file_name() != ".git")
        .build()
        .flatten()
    {
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if let Ok(rel) = entry.path().strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
            if out.len() >= limit {
                break;
            }
        }
    }
    out
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub query: String,
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    2000
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub column: usize,
    pub length: usize,
    pub preview: String,
}

/// Searches file contents across the workspace in parallel. Skips ignored, hidden-git
/// and binary files.
pub fn search(root: &Path, opts: &SearchOptions) -> Result<Vec<SearchMatch>> {
    if opts.query.is_empty() {
        return Ok(vec![]);
    }
    let mut pattern = if opts.regex {
        opts.query.clone()
    } else {
        regex::escape(&opts.query)
    };
    if opts.whole_word {
        pattern = format!(r"\b(?:{pattern})\b");
    }
    let re = RegexBuilder::new(&pattern)
        .case_insensitive(!opts.case_sensitive)
        .build()
        .map_err(|e| FsError::Pattern(e.to_string()))?;

    let results = Arc::new(Mutex::new(Vec::new()));
    let count = Arc::new(AtomicUsize::new(0));
    let limit = opts.limit;

    WalkBuilder::new(root)
        .hidden(false)
        .filter_entry(|e| e.file_name() != ".git")
        .build_parallel()
        .run(|| {
            let re = re.clone();
            let results = results.clone();
            let count = count.clone();
            Box::new(move |entry| {
                use ignore::WalkState;
                if count.load(Ordering::Relaxed) >= limit {
                    return WalkState::Quit;
                }
                let Ok(entry) = entry else {
                    return WalkState::Continue;
                };
                if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    return WalkState::Continue;
                }
                if entry
                    .metadata()
                    .map(|m| m.len() > 8 * 1024 * 1024)
                    .unwrap_or(true)
                {
                    return WalkState::Continue;
                }
                let Ok(bytes) = std::fs::read(entry.path()) else {
                    return WalkState::Continue;
                };
                if bytes[..bytes.len().min(8192)].contains(&0) {
                    return WalkState::Continue;
                }
                let text = String::from_utf8_lossy(&bytes);
                let rel = entry
                    .path()
                    .strip_prefix(root)
                    .unwrap_or(entry.path())
                    .to_string_lossy()
                    .replace('\\', "/");
                let mut local = Vec::new();
                for (i, line) in text.lines().enumerate() {
                    for m in re.find_iter(line) {
                        let column = line[..m.start()].chars().count();
                        let preview: String = line.trim_end().chars().take(400).collect();
                        local.push(SearchMatch {
                            path: rel.clone(),
                            line: i + 1,
                            column: column + 1,
                            length: m.as_str().chars().count(),
                            preview,
                        });
                    }
                }
                if !local.is_empty() {
                    count.fetch_add(local.len(), Ordering::Relaxed);
                    results.lock().extend(local);
                }
                WalkState::Continue
            })
        });

    let mut out = Arc::try_unwrap(results)
        .map(|m| m.into_inner())
        .unwrap_or_default();
    out.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then(a.line.cmp(&b.line))
            .then(a.column.cmp(&b.column))
    });
    out.truncate(limit);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_matches_and_respects_gitignore() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir(root.join(".git")).unwrap();
        std::fs::write(root.join(".gitignore"), "ignored.txt\n").unwrap();
        std::fs::write(root.join("a.rs"), "fn main() {\n  let Hello = 1;\n}\n").unwrap();
        std::fs::write(root.join("ignored.txt"), "hello").unwrap();
        let opts = SearchOptions {
            query: "hello".into(),
            regex: false,
            case_sensitive: false,
            whole_word: false,
            limit: 100,
        };
        let r = search(root, &opts).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].path, "a.rs");
        assert_eq!((r[0].line, r[0].column), (2, 7));
        let files = list_files(root, 100);
        assert!(files.contains(&"a.rs".to_string()));
        assert!(!files.contains(&"ignored.txt".to_string()));
    }
}
