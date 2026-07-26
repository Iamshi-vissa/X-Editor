use std::fs;
use std::path::Path;
use std::io::{BufRead, BufReader};
use walkdir::WalkDir;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultMatch {
    pub path: String,
    pub filename: String,
    pub line_number: Option<usize>,
    pub line_snippet: Option<String>,
}

pub fn search_workspace(
    workspace_root: &Path,
    query: &str,
    is_content_search: bool,
    max_results: usize,
) -> Vec<SearchResultMatch> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    for entry in WalkDir::new(workspace_root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "target"
        })
        .filter_map(|e| e.ok())
    {
        if results.len() >= max_results {
            break;
        }

        let path = entry.path();
        let filename = entry.file_name().to_string_lossy().into_owned();

        if !is_content_search {
            if filename.to_lowercase().contains(&query_lower) {
                results.push(SearchResultMatch {
                    path: path.to_string_lossy().into_owned(),
                    filename,
                    line_number: None,
                    line_snippet: None,
                });
            }
        } else if entry.file_type().is_file() {
            if let Ok(file) = fs::File::open(path) {
                let reader = BufReader::new(file);
                for (idx, line_res) in reader.lines().enumerate() {
                    if results.len() >= max_results {
                        break;
                    }
                    if let Ok(line) = line_res {
                        if line.to_lowercase().contains(&query_lower) {
                            results.push(SearchResultMatch {
                                path: path.to_string_lossy().into_owned(),
                                filename: filename.clone(),
                                line_number: Some(idx + 1),
                                line_snippet: Some(line.trim().to_string()),
                            });
                        }
                    }
                }
            }
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_search_workspace() {
        let temp_dir = std::env::temp_dir().join("x_editor_search_test");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let file1 = temp_dir.join("match_filename.txt");
        fs::write(&file1, "some text content").unwrap();

        let file2 = temp_dir.join("other.txt");
        fs::write(&file2, "target needle line here").unwrap();

        let filename_matches = search_workspace(&temp_dir, "match_filename", false, 10);
        assert_eq!(filename_matches.len(), 1);
        assert_eq!(filename_matches[0].filename, "match_filename.txt");

        let content_matches = search_workspace(&temp_dir, "needle", true, 10);
        assert_eq!(content_matches.len(), 1);
        assert_eq!(content_matches[0].line_number, Some(1));

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
