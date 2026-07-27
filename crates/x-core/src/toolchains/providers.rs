use std::collections::HashMap;
use std::process::Command;
use crate::toolchains::manifest::{ToolchainManifest, ToolchainScope, ToolchainStatus, VerificationState};

pub trait ToolchainProvider: Send + Sync {
    fn identify(&self) -> &'static str;
    fn list_available(&self) -> Vec<ToolchainManifest>;
    fn detect_installed(&self) -> Vec<ToolchainManifest>;
}

pub struct GccProvider;
impl ToolchainProvider for GccProvider {
    fn identify(&self) -> &'static str {
        "gcc"
    }

    fn list_available(&self) -> Vec<ToolchainManifest> {
        vec![
            ToolchainManifest {
                id: "gcc-15-x86_64".to_string(),
                name: "GCC 15 C/C++ Compiler".to_string(),
                language: "cpp".to_string(),
                version: "15.0".to_string(),
                platform: std::env::consts::OS.to_string(),
                architecture: std::env::consts::ARCH.to_string(),
                distribution: "gcc".to_string(),
                source_url: "https://gcc.gnu.org".to_string(),
                download_url: "https://gcc.gnu.org/pub/gcc/releases/gcc-15.0.0.tar.gz".to_string(),
                sha256_checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
                signature: None,
                license: "GPLv3".to_string(),
                installation_path: None,
                executable_paths: HashMap::from([("gcc".to_string(), "bin/gcc".to_string()), ("g++".to_string(), "bin/g++".to_string())]),
                environment_variables: HashMap::from([("CC".to_string(), "gcc".to_string()), ("CXX".to_string(), "g++".to_string())]),
                capabilities: vec!["c".to_string(), "cpp".to_string()],
                scope: ToolchainScope::Global,
                status: ToolchainStatus::Available,
                verification_states: vec![],
            }
        ]
    }

    fn detect_installed(&self) -> Vec<ToolchainManifest> {
        let mut detected = Vec::new();
        let cmd_name = if cfg!(windows) { "gcc.exe" } else { "gcc" };

        if let Ok(output) = Command::new(cmd_name).arg("--version").output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let first_line = stdout.lines().next().unwrap_or("gcc (GCC) 14.0");
                let version = extract_version_number(first_line).unwrap_or_else(|| "14.0.0".to_string());

                detected.push(ToolchainManifest {
                    id: format!("gcc-system-{}", version),
                    name: format!("System GCC {}", version),
                    language: "cpp".to_string(),
                    version: version.clone(),
                    platform: std::env::consts::OS.to_string(),
                    architecture: std::env::consts::ARCH.to_string(),
                    distribution: "gcc".to_string(),
                    source_url: "system".to_string(),
                    download_url: "system".to_string(),
                    sha256_checksum: "system".to_string(),
                    signature: None,
                    license: "GPLv3".to_string(),
                    installation_path: Some("system".to_string()),
                    executable_paths: HashMap::from([("gcc".to_string(), cmd_name.to_string())]),
                    environment_variables: HashMap::from([("CC".to_string(), cmd_name.to_string())]),
                    capabilities: vec!["c".to_string(), "cpp".to_string()],
                    scope: ToolchainScope::Global,
                    status: ToolchainStatus::Installed,
                    verification_states: vec![VerificationState::InstallationValidated],
                });
            }
        }
        detected
    }
}

pub struct ClangProvider;
impl ToolchainProvider for ClangProvider {
    fn identify(&self) -> &'static str {
        "clang"
    }

    fn list_available(&self) -> Vec<ToolchainManifest> {
        vec![
            ToolchainManifest {
                id: "clang-20-x86_64".to_string(),
                name: "LLVM Clang 20 Toolchain".to_string(),
                language: "cpp".to_string(),
                version: "20.0".to_string(),
                platform: std::env::consts::OS.to_string(),
                architecture: std::env::consts::ARCH.to_string(),
                distribution: "llvm".to_string(),
                source_url: "https://llvm.org".to_string(),
                download_url: "https://github.com/llvm/llvm-project/releases/download/llvmorg-20.0.0/clang-20.tar.gz".to_string(),
                sha256_checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
                signature: None,
                license: "Apache-2.0".to_string(),
                installation_path: None,
                executable_paths: HashMap::from([("clang".to_string(), "bin/clang".to_string()), ("clang++".to_string(), "bin/clang++".to_string())]),
                environment_variables: HashMap::from([("CC".to_string(), "clang".to_string()), ("CXX".to_string(), "clang++".to_string())]),
                capabilities: vec!["c".to_string(), "cpp".to_string()],
                scope: ToolchainScope::Global,
                status: ToolchainStatus::Available,
                verification_states: vec![],
            }
        ]
    }

    fn detect_installed(&self) -> Vec<ToolchainManifest> {
        let mut detected = Vec::new();
        let cmd_name = if cfg!(windows) { "clang.exe" } else { "clang" };

        if let Ok(output) = Command::new(cmd_name).arg("--version").output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let first_line = stdout.lines().next().unwrap_or("clang version 18.0");
                let version = extract_version_number(first_line).unwrap_or_else(|| "18.0.0".to_string());

                detected.push(ToolchainManifest {
                    id: format!("clang-system-{}", version),
                    name: format!("System Clang {}", version),
                    language: "cpp".to_string(),
                    version: version.clone(),
                    platform: std::env::consts::OS.to_string(),
                    architecture: std::env::consts::ARCH.to_string(),
                    distribution: "llvm".to_string(),
                    source_url: "system".to_string(),
                    download_url: "system".to_string(),
                    sha256_checksum: "system".to_string(),
                    signature: None,
                    license: "Apache-2.0".to_string(),
                    installation_path: Some("system".to_string()),
                    executable_paths: HashMap::from([("clang".to_string(), cmd_name.to_string())]),
                    environment_variables: HashMap::from([("CC".to_string(), cmd_name.to_string())]),
                    capabilities: vec!["c".to_string(), "cpp".to_string()],
                    scope: ToolchainScope::Global,
                    status: ToolchainStatus::Installed,
                    verification_states: vec![VerificationState::InstallationValidated],
                });
            }
        }
        detected
    }
}

pub struct RustProvider;
impl ToolchainProvider for RustProvider {
    fn identify(&self) -> &'static str {
        "rust"
    }

    fn list_available(&self) -> Vec<ToolchainManifest> {
        vec![
            ToolchainManifest {
                id: "rust-stable-x86_64".to_string(),
                name: "Rust Stable Toolchain".to_string(),
                language: "rust".to_string(),
                version: "1.80.0".to_string(),
                platform: std::env::consts::OS.to_string(),
                architecture: std::env::consts::ARCH.to_string(),
                distribution: "rustup".to_string(),
                source_url: "https://www.rust-lang.org".to_string(),
                download_url: "https://static.rust-lang.org/dist/rust-1.80.0-x86_64.tar.gz".to_string(),
                sha256_checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
                signature: None,
                license: "MIT/Apache-2.0".to_string(),
                installation_path: None,
                executable_paths: HashMap::from([("rustc".to_string(), "bin/rustc".to_string()), ("cargo".to_string(), "bin/cargo".to_string())]),
                environment_variables: HashMap::default(),
                capabilities: vec!["rust".to_string()],
                scope: ToolchainScope::Global,
                status: ToolchainStatus::Available,
                verification_states: vec![],
            }
        ]
    }

    fn detect_installed(&self) -> Vec<ToolchainManifest> {
        let mut detected = Vec::new();
        let cmd_name = if cfg!(windows) { "rustc.exe" } else { "rustc" };

        if let Ok(output) = Command::new(cmd_name).arg("--version").output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let first_line = stdout.lines().next().unwrap_or("rustc 1.80.0");
                let version = extract_version_number(first_line).unwrap_or_else(|| "1.80.0".to_string());

                detected.push(ToolchainManifest {
                    id: format!("rust-system-{}", version),
                    name: format!("System Rust {}", version),
                    language: "rust".to_string(),
                    version: version.clone(),
                    platform: std::env::consts::OS.to_string(),
                    architecture: std::env::consts::ARCH.to_string(),
                    distribution: "rustup".to_string(),
                    source_url: "system".to_string(),
                    download_url: "system".to_string(),
                    sha256_checksum: "system".to_string(),
                    signature: None,
                    license: "MIT/Apache-2.0".to_string(),
                    installation_path: Some("system".to_string()),
                    executable_paths: HashMap::from([("rustc".to_string(), cmd_name.to_string())]),
                    environment_variables: HashMap::default(),
                    capabilities: vec!["rust".to_string()],
                    scope: ToolchainScope::Global,
                    status: ToolchainStatus::Installed,
                    verification_states: vec![VerificationState::InstallationValidated],
                });
            }
        }
        detected
    }
}

pub struct NodeProvider;
impl ToolchainProvider for NodeProvider {
    fn identify(&self) -> &'static str {
        "node"
    }

    fn list_available(&self) -> Vec<ToolchainManifest> {
        vec![
            ToolchainManifest {
                id: "node-22-x86_64".to_string(),
                name: "Node.js v22 LTS".to_string(),
                language: "javascript".to_string(),
                version: "22.0.0".to_string(),
                platform: std::env::consts::OS.to_string(),
                architecture: std::env::consts::ARCH.to_string(),
                distribution: "node".to_string(),
                source_url: "https://nodejs.org".to_string(),
                download_url: "https://nodejs.org/dist/v22.0.0/node-v22.0.0.tar.gz".to_string(),
                sha256_checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
                signature: None,
                license: "MIT".to_string(),
                installation_path: None,
                executable_paths: HashMap::from([("node".to_string(), "bin/node".to_string()), ("npm".to_string(), "bin/npm".to_string())]),
                environment_variables: HashMap::default(),
                capabilities: vec!["javascript".to_string(), "typescript".to_string()],
                scope: ToolchainScope::Global,
                status: ToolchainStatus::Available,
                verification_states: vec![],
            }
        ]
    }

    fn detect_installed(&self) -> Vec<ToolchainManifest> {
        let mut detected = Vec::new();
        let cmd_name = if cfg!(windows) { "node.exe" } else { "node" };

        if let Ok(output) = Command::new(cmd_name).arg("--version").output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let first_line = stdout.lines().next().unwrap_or("v20.0.0");
                let version = extract_version_number(first_line).unwrap_or_else(|| "20.0.0".to_string());

                detected.push(ToolchainManifest {
                    id: format!("node-system-{}", version),
                    name: format!("System Node.js {}", version),
                    language: "javascript".to_string(),
                    version: version.clone(),
                    platform: std::env::consts::OS.to_string(),
                    architecture: std::env::consts::ARCH.to_string(),
                    distribution: "node".to_string(),
                    source_url: "system".to_string(),
                    download_url: "system".to_string(),
                    sha256_checksum: "system".to_string(),
                    signature: None,
                    license: "MIT".to_string(),
                    installation_path: Some("system".to_string()),
                    executable_paths: HashMap::from([("node".to_string(), cmd_name.to_string())]),
                    environment_variables: HashMap::default(),
                    capabilities: vec!["javascript".to_string(), "typescript".to_string()],
                    scope: ToolchainScope::Global,
                    status: ToolchainStatus::Installed,
                    verification_states: vec![VerificationState::InstallationValidated],
                });
            }
        }
        detected
    }
}

fn extract_version_number(text: &str) -> Option<String> {
    for word in text.split_whitespace() {
        let trimmed = word.trim_start_matches('v');
        let parts: Vec<&str> = trimmed.split('.').collect();
        if parts.len() >= 2 && parts[0].chars().all(|c| c.is_ascii_digit()) {
            return Some(trimmed.to_string());
        }
    }
    None
}
