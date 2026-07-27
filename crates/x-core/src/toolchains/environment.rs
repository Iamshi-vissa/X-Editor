use std::collections::HashMap;
use std::path::PathBuf;
use crate::toolchains::manifest::ToolchainManifest;

#[derive(Debug, Clone)]
pub struct ResolvedToolchainEnvironment {
    pub env_map: HashMap<String, String>,
    pub prepended_paths: Vec<PathBuf>,
}

impl ResolvedToolchainEnvironment {
    pub fn build(toolchains: &[ToolchainManifest]) -> Self {
        let mut env_map = HashMap::new();
        let mut prepended_paths = Vec::new();

        for t in toolchains {
            if let Some(install_path_str) = &t.installation_path {
                if install_path_str != "system" {
                    let install_path = PathBuf::from(install_path_str);
                    let bin_dir = install_path.join("bin");
                    if bin_dir.exists() {
                        prepended_paths.push(bin_dir);
                    }
                }
            }

            for (k, v) in &t.environment_variables {
                env_map.insert(k.clone(), v.clone());
            }
        }

        // Construct prepended PATH string for child process execution
        if !prepended_paths.is_empty() {
            let host_path = std::env::var("PATH").unwrap_or_default();
            let path_sep = if cfg!(windows) { ";" } else { ":" };

            let new_path_entries: Vec<String> = prepended_paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();

            let full_path = format!("{}{}{}", new_path_entries.join(path_sep), path_sep, host_path);
            env_map.insert("PATH".to_string(), full_path);
        }

        Self {
            env_map,
            prepended_paths,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_host_os_path_remains_unchanged() {
        let initial_host_path = std::env::var("PATH").unwrap_or_default();

        let mock_manifest = ToolchainManifest {
            id: "test_toolchain".to_string(),
            name: "Test Toolchain".to_string(),
            language: "cpp".to_string(),
            version: "1.0".to_string(),
            platform: "windows".to_string(),
            architecture: "x86_64".to_string(),
            distribution: "gcc".to_string(),
            source_url: "https://example.com".to_string(),
            download_url: "https://example.com".to_string(),
            sha256_checksum: "checksum".to_string(),
            signature: None,
            license: "MIT".to_string(),
            installation_path: Some(std::env::temp_dir().to_string_lossy().to_string()),
            executable_paths: HashMap::from([("gcc".to_string(), "bin/gcc".to_string())]),
            environment_variables: HashMap::from([("CC".to_string(), "gcc".to_string())]),
            capabilities: vec![],
            scope: crate::toolchains::manifest::ToolchainScope::Global,
            status: crate::toolchains::manifest::ToolchainStatus::Installed,
            verification_states: vec![],
        };

        let resolved = ResolvedToolchainEnvironment::build(&[mock_manifest]);

        // Child process map gets environment variables
        assert_eq!(resolved.env_map.get("CC").unwrap(), "gcc");

        // Host OS PATH must remain completely untouched!
        let current_host_path = std::env::var("PATH").unwrap_or_default();
        assert_eq!(initial_host_path, current_host_path);
    }
}
