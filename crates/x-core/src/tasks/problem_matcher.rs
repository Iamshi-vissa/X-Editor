use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProblemSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Problem {
    pub file: String,
    pub line: usize,
    pub column: Option<usize>,
    pub severity: ProblemSeverity,
    pub message: String,
    pub source: String,
}

pub fn parse_compiler_output(output: &str, default_source: &str) -> Vec<Problem> {
    let mut problems = Vec::new();

    for raw_line in output.lines() {
        let line = raw_line.trim();

        // Pattern 1: GCC / Clang / Rust format: path/to/file:line:col: severity: message
        // Example: src/main.rs:14:5: error: missing semicolon
        if let Some(p) = parse_gcc_clang_rust(line, default_source) {
            problems.push(p);
            continue;
        }

        // Pattern 2: MSVC format: path\to\file(line,col): error C1234: message
        if let Some(p) = parse_msvc(line, default_source) {
            problems.push(p);
            continue;
        }
    }

    problems
}

fn parse_gcc_clang_rust(line: &str, source: &str) -> Option<Problem> {
    let parts: Vec<&str> = line.splitn(5, ':').collect();
    if parts.len() >= 4 {
        let file = parts[0].trim().to_string();
        if let Ok(line_num) = parts[1].trim().parse::<usize>() {
            let (col_num, sev_idx, msg_idx) = if let Ok(col) = parts[2].trim().parse::<usize>() {
                (Some(col), 3, 4)
            } else {
                (None, 2, 3)
            };

            if parts.len() > sev_idx {
                let sev_str = parts[sev_idx].trim().to_lowercase();
                let severity = if sev_str.contains("error") {
                    ProblemSeverity::Error
                } else if sev_str.contains("warning") {
                    ProblemSeverity::Warning
                } else {
                    ProblemSeverity::Info
                };

                let message = if parts.len() > msg_idx {
                    parts[msg_idx..].join(":").trim().to_string()
                } else {
                    parts[sev_idx].trim().to_string()
                };

                if !file.is_empty() && !message.is_empty() {
                    return Some(Problem {
                        file,
                        line: line_num,
                        column: col_num,
                        severity,
                        message,
                        source: source.to_string(),
                    });
                }
            }
        }
    }
    None
}

fn parse_msvc(line: &str, source: &str) -> Option<Problem> {
    if let Some(open_paren) = line.find('(') {
        if let Some(close_paren) = line[open_paren..].find(')') {
            let close_paren_idx = open_paren + close_paren;
            let file = line[..open_paren].trim().to_string();
            let nums = &line[open_paren + 1..close_paren_idx];
            
            let mut line_num = None;
            let mut col_num = None;

            if nums.contains(',') {
                let parts: Vec<&str> = nums.split(',').collect();
                if parts.len() == 2 {
                    line_num = parts[0].trim().parse::<usize>().ok();
                    col_num = parts[1].trim().parse::<usize>().ok();
                }
            } else {
                line_num = nums.trim().parse::<usize>().ok();
            }

            if let Some(line_num) = line_num {
                let rest = line[close_paren_idx + 1..].trim();
                let severity = if rest.to_lowercase().contains("error") {
                    ProblemSeverity::Error
                } else if rest.to_lowercase().contains("warning") {
                    ProblemSeverity::Warning
                } else {
                    ProblemSeverity::Info
                };

                if !file.is_empty() && !rest.is_empty() {
                    return Some(Problem {
                        file,
                        line: line_num,
                        column: col_num,
                        severity,
                        message: rest.to_string(),
                        source: source.to_string(),
                    });
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_gcc_rust_output() {
        let sample = "src/main.rs:14:5: error: missing semicolon\nsrc/lib.rs:20: warning: unused variable `x`";
        let problems = parse_compiler_output(sample, "rustc");
        assert_eq!(problems.len(), 2);

        assert_eq!(problems[0].file, "src/main.rs");
        assert_eq!(problems[0].line, 14);
        assert_eq!(problems[0].column, Some(5));
        assert_eq!(problems[0].severity, ProblemSeverity::Error);
        assert_eq!(problems[0].message, "missing semicolon");

        assert_eq!(problems[1].file, "src/lib.rs");
        assert_eq!(problems[1].line, 20);
        assert_eq!(problems[1].severity, ProblemSeverity::Warning);
    }

    #[test]
    fn test_parse_msvc_output() {
        let sample = "C:\\project\\main.cpp(42,10): error C2065: 'x': undeclared identifier";
        let problems = parse_compiler_output(sample, "msvc");
        assert_eq!(problems.len(), 1);

        assert_eq!(problems[0].file, "C:\\project\\main.cpp");
        assert_eq!(problems[0].line, 42);
        assert_eq!(problems[0].column, Some(10));
        assert_eq!(problems[0].severity, ProblemSeverity::Error);
    }
}
