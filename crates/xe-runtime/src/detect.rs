use regex::Regex;
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledRuntime {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub path: String,
}

/// (id, display name, binaries to try, version flag)
const KNOWN: &[(&str, &str, &[&str], &str)] = &[
    ("node", "Node.js", &["node"], "--version"),
    ("bun", "Bun", &["bun"], "--version"),
    ("deno", "Deno", &["deno"], "--version"),
    (
        "python",
        "Python",
        &["python3", "python", "py"],
        "--version",
    ),
    ("rust", "Rust", &["rustc"], "--version"),
    ("cargo", "Cargo", &["cargo"], "--version"),
    ("go", "Go", &["go"], "version"),
    ("java", "Java", &["java"], "-version"),
    ("gcc", "GCC", &["gcc"], "--version"),
    ("clang", "Clang", &["clang"], "--version"),
    ("dotnet", ".NET", &["dotnet"], "--version"),
    ("ruby", "Ruby", &["ruby"], "--version"),
    ("php", "PHP", &["php"], "--version"),
    ("mise", "mise", &["mise"], "--version"),
    ("git", "Git", &["git"], "--version"),
];

fn version_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(\d+)\.(\d+)(?:\.(\d+))?").unwrap())
}

/// Finds the version number in a `--version` banner. Lines that mention "version" or
/// the tool name win over others, so notices like "Picked up JAVA_TOOL_OPTIONS:
/// -Dhttp.proxyHost=127.0.0.1" aren't mistaken for the version.
pub fn extract_version(text: &str) -> Option<String> {
    let preferred = text
        .lines()
        .filter(|l| !l.starts_with("Picked up") && !l.contains("proxy"))
        .find(|l| l.to_lowercase().contains("version") && version_re().is_match(l));
    let line = preferred.or_else(|| {
        text.lines()
            .filter(|l| !l.starts_with("Picked up"))
            .find(|l| version_re().is_match(l))
    })?;
    version_re().find(line).map(|m| m.as_str().to_string())
}

/// Checks every known runtime in parallel (each `--version` runs on its own thread).
pub fn detect_installed() -> Vec<InstalledRuntime> {
    let handles: Vec<_> = KNOWN
        .iter()
        .map(|&(id, name, bins, flag)| {
            std::thread::spawn(move || {
                for bin in bins {
                    let Ok(path) = which::which(bin) else {
                        continue;
                    };
                    let mut cmd = Command::new(&path);
                    cmd.arg(flag);
                    #[cfg(windows)]
                    {
                        use std::os::windows::process::CommandExt;
                        cmd.creation_flags(0x0800_0000);
                    }
                    let Ok(out) = cmd.output() else { continue };
                    let text = format!(
                        "{}{}",
                        String::from_utf8_lossy(&out.stdout),
                        String::from_utf8_lossy(&out.stderr)
                    );
                    // The Windows Store "python" stub prints an install hint and fails.
                    if !out.status.success() && extract_version(&text).is_none() {
                        continue;
                    }
                    return Some(InstalledRuntime {
                        id: id.into(),
                        name: name.into(),
                        version: extract_version(&text),
                        path: path.to_string_lossy().into(),
                    });
                }
                None
            })
        })
        .collect();
    handles
        .into_iter()
        .filter_map(|h| h.join().ok().flatten())
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Requirement {
    /// Matches InstalledRuntime::id
    pub runtime: String,
    pub requested: String,
    pub source: String,
}

fn read(root: &Path, file: &str) -> Option<String> {
    std::fs::read_to_string(root.join(file)).ok()
}

/// Reads version requirements from the common version files in the project root.
pub fn project_requirements(root: &Path) -> Vec<Requirement> {
    let mut out: Vec<Requirement> = Vec::new();
    let mut push = |runtime: &str, requested: &str, source: &str| {
        let requested = requested
            .trim()
            .trim_matches('"')
            .trim_start_matches('v')
            .to_string();
        if !requested.is_empty() && !out.iter().any(|r| r.runtime == runtime) {
            out.push(Requirement {
                runtime: runtime.into(),
                requested,
                source: source.into(),
            });
        }
    };

    for file in [".nvmrc", ".node-version"] {
        if let Some(t) = read(root, file) {
            if let Some(line) = t.lines().next() {
                push("node", line, file);
            }
        }
    }
    if let Some(t) = read(root, ".python-version") {
        if let Some(line) = t.lines().next() {
            push("python", line, ".python-version");
        }
    }
    if let Some(t) = read(root, "rust-toolchain.toml") {
        if let Some(c) = Regex::new(r#"channel\s*=\s*"([^"]+)""#)
            .unwrap()
            .captures(&t)
        {
            push("rust", &c[1], "rust-toolchain.toml");
        }
    } else if let Some(t) = read(root, "rust-toolchain") {
        push("rust", t.lines().next().unwrap_or(""), "rust-toolchain");
    }
    if let Some(t) = read(root, "go.mod") {
        if let Some(c) = Regex::new(r"(?m)^go\s+(\S+)").unwrap().captures(&t) {
            push("go", &c[1], "go.mod");
        }
    }
    {
        let file = ".tool-versions";
        if let Some(t) = read(root, file) {
            for line in t.lines() {
                let mut parts = line.split(' ').filter(|s| !s.is_empty());
                if let (Some(tool), Some(ver)) = (parts.next(), parts.next()) {
                    let id = match tool {
                        "nodejs" | "node" => "node",
                        "python" => "python",
                        "rust" => "rust",
                        "golang" | "go" => "go",
                        "java" => "java",
                        "ruby" => "ruby",
                        other => other,
                    };
                    push(id, ver, file);
                }
            }
        }
    }
    let mise_re =
        Regex::new(r#"(?m)^\s*(node|python|rust|go|java|ruby|bun|deno)\s*=\s*"([^"]+)""#).unwrap();
    for file in ["mise.toml", ".mise.toml"] {
        if let Some(t) = read(root, file) {
            let re = &mise_re;
            for c in re.captures_iter(&t) {
                push(&c[1], &c[2], file);
            }
        }
    }
    if let Some(t) = read(root, "package.json") {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
            if let Some(node) = v.pointer("/engines/node").and_then(|n| n.as_str()) {
                push("node", node, "package.json");
            }
        }
    }
    if let Some(t) = read(root, "pyproject.toml") {
        if let Some(c) = Regex::new(r#"requires-python\s*=\s*"([^"]+)""#)
            .unwrap()
            .captures(&t)
        {
            push("python", &c[1], "pyproject.toml");
        }
    }
    out
}

fn parse_nums(v: &str) -> Vec<u64> {
    v.split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse().ok())
        .collect()
}

/// Returns Some(true/false) when the requirement can be checked, None when it's a form we
/// don't understand (e.g. "lts/*", "stable", complex ranges).
pub fn satisfies(installed: &str, requested: &str) -> Option<bool> {
    let req = requested.trim();
    let first = req
        .split(|c: char| c == ',' || c == '|' || c.is_whitespace())
        .find(|s| !s.is_empty())?;
    let (op, ver) = if let Some(r) = first.strip_prefix(">=") {
        (">=", r)
    } else if let Some(r) = first.strip_prefix('>') {
        (">", r)
    } else if let Some(r) = first.strip_prefix("~=") {
        ("~", r)
    } else if let Some(r) = first.strip_prefix('^') {
        ("^", r)
    } else if let Some(r) = first.strip_prefix('~') {
        ("~", r)
    } else if let Some(r) = first.strip_prefix("==") {
        ("=", r)
    } else {
        ("=", first)
    };
    let want = parse_nums(ver);
    let have = parse_nums(installed);
    if want.is_empty() || have.is_empty() {
        return None;
    }
    let cmp = |a: &[u64], b: &[u64]| {
        for i in 0..a.len().max(b.len()) {
            let (x, y) = (
                a.get(i).copied().unwrap_or(0),
                b.get(i).copied().unwrap_or(0),
            );
            if x != y {
                return x.cmp(&y);
            }
        }
        std::cmp::Ordering::Equal
    };
    Some(match op {
        ">=" => cmp(&have, &want) != std::cmp::Ordering::Less,
        ">" => cmp(&have, &want) == std::cmp::Ordering::Greater,
        "^" => have[0] == want[0] && cmp(&have, &want) != std::cmp::Ordering::Less,
        "~" => {
            have.len() >= 2 && want.len() >= 2 && have[..2] == want[..2]
                || (want.len() == 1 && have[0] == want[0])
        }
        _ => have.iter().zip(want.iter()).all(|(a, b)| a == b),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matching() {
        assert_eq!(satisfies("20.11.0", "20"), Some(true));
        assert_eq!(satisfies("20.11.0", "18"), Some(false));
        assert_eq!(satisfies("20.11.0", ">=18"), Some(true));
        assert_eq!(satisfies("3.12.1", ">=3.10"), Some(true));
        assert_eq!(satisfies("3.9.1", ">=3.10"), Some(false));
        assert_eq!(satisfies("1.22.0", "1.21"), Some(false));
        assert_eq!(satisfies("18.2.0", "^18.1"), Some(true));
        assert_eq!(satisfies("1.80.0", "stable"), None);
    }

    #[test]
    fn reads_requirements() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join(".nvmrc"), "v20.11.0\n").unwrap();
        std::fs::write(d.path().join("go.mod"), "module x\n\ngo 1.22\n").unwrap();
        std::fs::write(
            d.path().join("pyproject.toml"),
            "[project]\nrequires-python = \">=3.10\"\n",
        )
        .unwrap();
        let r = project_requirements(d.path());
        let get = |id: &str| {
            r.iter()
                .find(|x| x.runtime == id)
                .map(|x| x.requested.clone())
        };
        assert_eq!(get("node").as_deref(), Some("20.11.0"));
        assert_eq!(get("go").as_deref(), Some("1.22"));
        assert_eq!(get("python").as_deref(), Some(">=3.10"));
    }

    #[test]
    fn extracts_versions() {
        assert_eq!(
            extract_version("rustc 1.97.0 (2d8144b78 2026-07-07)").as_deref(),
            Some("1.97.0")
        );
        assert_eq!(
            extract_version("go version go1.22.3 linux/amd64").as_deref(),
            Some("1.22.3")
        );
        let java = "Picked up JAVA_TOOL_OPTIONS: -Dhttp.proxyHost=127.0.0.1\nopenjdk version \"21.0.4\" 2024-07-16\n";
        assert_eq!(extract_version(java).as_deref(), Some("21.0.4"));
    }
}
