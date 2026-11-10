use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPlan {
    /// The command line to type into the terminal.
    pub command: String,
    /// Where to run it.
    pub cwd: String,
    /// Short description shown in the UI, e.g. "cargo run".
    pub label: String,
}

/// Quotes one argument for the given shell kind ("posix", "powershell" or "cmd").
pub fn quote(arg: &str, shell: &str) -> String {
    match shell {
        "powershell" => format!("'{}'", arg.replace('\'', "''")),
        "cmd" => format!("\"{}\"", arg.replace('"', "")),
        _ => {
            if !arg.is_empty() && arg.chars().all(|c| c.is_ascii_alphanumeric() || "-_./:=@%+".contains(c)) {
                arg.to_string()
            } else {
                format!("'{}'", arg.replace('\'', r"'\''"))
            }
        }
    }
}

/// Runs `first`, then `second` only if `first` succeeded.
fn and_then(first: &str, second: &str, shell: &str) -> String {
    match shell {
        "powershell" => format!("{first}; if ($?) {{ {second} }}"),
        _ => format!("{first} && {second}"),
    }
}

/// Invokes an executable path.
fn exec(path: &str, shell: &str) -> String {
    match shell {
        "powershell" => format!("& {}", quote(path, shell)),
        _ => quote(path, shell),
    }
}

/// Builds the command for "Run this project": recognises Cargo, npm/pnpm/yarn/bun scripts,
/// Go modules, Python projects, Maven/Gradle, .NET and Makefiles.
pub fn plan_project(root: &Path, shell: &str) -> Option<RunPlan> {
    let cwd = root.to_string_lossy().to_string();
    let has = |f: &str| root.join(f).exists();
    let plan = |cmd: &str| Some(RunPlan { command: cmd.into(), cwd: cwd.clone(), label: cmd.into() });

    if has("Cargo.toml") {
        return plan("cargo run");
    }
    if has("package.json") {
        let pm = if has("bun.lockb") || has("bun.lock") {
            "bun"
        } else if has("pnpm-lock.yaml") {
            "pnpm"
        } else if has("yarn.lock") {
            "yarn"
        } else {
            "npm"
        };
        let scripts = std::fs::read_to_string(root.join("package.json"))
            .ok()
            .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
            .and_then(|v| v.get("scripts").cloned());
        for s in ["dev", "start", "serve"] {
            if scripts.as_ref().and_then(|v| v.get(s)).is_some() {
                return plan(&format!("{pm} run {s}"));
            }
        }
    }
    if has("go.mod") {
        return plan("go run .");
    }
    if has("manage.py") {
        return plan("python manage.py runserver");
    }
    if has("main.py") {
        return plan(&format!("python {}", quote("main.py", shell)));
    }
    if has("pom.xml") {
        return plan("mvn -q compile exec:java");
    }
    if has("gradlew") || has("build.gradle") || has("build.gradle.kts") {
        return plan(if cfg!(windows) { ".\\gradlew run" } else { "./gradlew run" });
    }
    if std::fs::read_dir(root).ok()?.flatten().any(|e| e.path().extension().is_some_and(|x| x == "csproj")) {
        return plan("dotnet run");
    }
    if has("Makefile") {
        return plan("make");
    }
    None
}

/// Builds the command for "Run this file". Compiled languages build into `out_dir` (a
/// temp folder), never next to the source.
pub fn plan_file(file: &Path, out_dir: &Path, shell: &str) -> Option<RunPlan> {
    let ext = file.extension()?.to_string_lossy().to_lowercase();
    let stem = file.file_stem()?.to_string_lossy().to_string();
    let dir = file.parent()?.to_string_lossy().to_string();
    let f = file.to_string_lossy().to_string();
    let exe_suffix = if cfg!(windows) { ".exe" } else { "" };
    let bin = out_dir.join(format!("{stem}{exe_suffix}")).to_string_lossy().to_string();
    let q = |s: &str| quote(s, shell);

    let command = match ext.as_str() {
        "py" => format!("python {}", q(&f)),
        "js" | "mjs" | "cjs" => format!("node {}", q(&f)),
        "ts" | "mts" | "cts" => {
            if which::which("bun").is_ok() {
                format!("bun {}", q(&f))
            } else if which::which("deno").is_ok() {
                format!("deno run {}", q(&f))
            } else {
                format!("npx --yes tsx {}", q(&f))
            }
        }
        "c" => and_then(&format!("gcc {} -o {}", q(&f), q(&bin)), &exec(&bin, shell), shell),
        "cpp" | "cc" | "cxx" => and_then(&format!("g++ -std=c++20 {} -o {}", q(&f), q(&bin)), &exec(&bin, shell), shell),
        "rs" => and_then(&format!("rustc --edition 2021 {} -o {}", q(&f), q(&bin)), &exec(&bin, shell), shell),
        "go" => format!("go run {}", q(&f)),
        "java" => format!("java {}", q(&f)),
        "kt" => {
            let jar = out_dir.join(format!("{stem}.jar")).to_string_lossy().to_string();
            and_then(&format!("kotlinc {} -include-runtime -d {}", q(&f), q(&jar)), &format!("java -jar {}", q(&jar)), shell)
        }
        "rb" => format!("ruby {}", q(&f)),
        "php" => format!("php {}", q(&f)),
        "lua" => format!("lua {}", q(&f)),
        "pl" => format!("perl {}", q(&f)),
        "dart" => format!("dart run {}", q(&f)),
        "swift" => format!("swift {}", q(&f)),
        "sh" | "bash" => format!("bash {}", q(&f)),
        "zsh" => format!("zsh {}", q(&f)),
        "ps1" => format!("pwsh -NoLogo -File {}", q(&f)),
        "r" => format!("Rscript {}", q(&f)),
        "jl" => format!("julia {}", q(&f)),
        "ex" | "exs" => format!("elixir {}", q(&f)),
        "hs" => format!("runghc {}", q(&f)),
        _ => return None,
    };
    Some(RunPlan { label: format!("Run {}", file.file_name()?.to_string_lossy()), command, cwd: dir })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quoting() {
        assert_eq!(quote("simple.py", "posix"), "simple.py");
        assert_eq!(quote("it's here.py", "posix"), r"'it'\''s here.py'");
        assert_eq!(quote("C:\\a b\\x.py", "powershell"), "'C:\\a b\\x.py'");
    }

    #[test]
    fn c_file_compiles_to_out_dir_and_chains() {
        let p = plan_file(Path::new("/w/hello world.c"), Path::new("/tmp/xe"), "posix").unwrap();
        assert!(p.command.starts_with("gcc '/w/hello world.c' -o '/tmp/xe/hello world'"), "{}", p.command);
        assert!(p.command.contains(" && "));
        let p = plan_file(Path::new("/w/a.c"), Path::new("/tmp/xe"), "powershell").unwrap();
        assert!(p.command.contains("; if ($?) { & '/tmp/xe/a"));
    }

    #[test]
    fn project_detection() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("package.json"), r#"{"scripts":{"dev":"vite"}}"#).unwrap();
        std::fs::write(d.path().join("pnpm-lock.yaml"), "").unwrap();
        assert_eq!(plan_project(d.path(), "posix").unwrap().command, "pnpm run dev");
    }
}
