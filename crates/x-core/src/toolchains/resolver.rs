use std::fs;
use std::path::Path;
use crate::toolchains::manifest::{ProjectToolchainConfig, ToolchainManifest, ProjectToolchainRequirement};
use crate::toolchains::registry::get_toolchain_registry;
use crate::errors::XCoreError;

pub fn load_project_toolchain_config(workspace_root: &Path) -> ProjectToolchainConfig {
    let config_path = workspace_root.join(".x-editor").join("toolchains.json");
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<ProjectToolchainConfig>(&content) {
                return config;
            }
        }
    }
    ProjectToolchainConfig::default()
}

pub fn save_project_toolchain_config(workspace_root: &Path, config: &ProjectToolchainConfig) -> Result<(), String> {
    let dir = workspace_root.join(".x-editor");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(dir.join("toolchains.json"), content).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn resolve_toolchain_for_requirement(
    req: &ProjectToolchainRequirement,
) -> Result<ToolchainManifest, XCoreError> {
    let reg_arc = get_toolchain_registry();
    let reg = reg_arc.lock().unwrap();
    let installed = reg.list_installed_toolchains();

    // Match exact distribution + version requirement
    let match_opt = installed.into_iter().find(|t| {
        t.language.eq_ignore_ascii_case(&req.language)
            && t.distribution.eq_ignore_ascii_case(&req.distribution)
            && t.version.starts_with(&req.version)
    });

    if let Some(toolchain) = match_opt {
        Ok(toolchain)
    } else {
        Err(XCoreError::ToolchainUnavailable(format!(
            "Requested toolchain (Language: {}, Distribution: {}, Version: {}) is unavailable",
            req.language, req.distribution, req.version
        )))
    }
}

pub fn resolve_active_project_toolchains(workspace_root: &Path) -> Vec<ToolchainManifest> {
    let config = load_project_toolchain_config(workspace_root);
    let mut resolved = Vec::new();

    for req in &config.toolchains {
        if let Ok(m) = resolve_toolchain_for_requirement(req) {
            resolved.push(m);
        }
    }

    resolved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolution_no_silent_fallback() {
        let req = ProjectToolchainRequirement {
            language: "cpp".to_string(),
            distribution: "nonexistent_distro".to_string(),
            version: "99.0".to_string(),
        };

        let res = resolve_toolchain_for_requirement(&req);
        assert!(res.is_err());
        match res.unwrap_err() {
            XCoreError::ToolchainUnavailable(msg) => {
                assert!(msg.contains("nonexistent_distro"));
            }
            _ => panic!("Expected ToolchainUnavailable error"),
        }
    }
}
