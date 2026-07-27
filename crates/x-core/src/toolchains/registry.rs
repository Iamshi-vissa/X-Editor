use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use crate::toolchains::manifest::{ToolchainManifest, ToolchainScope, ToolchainStatus};
use crate::toolchains::providers::{ToolchainProvider, GccProvider, ClangProvider, RustProvider, NodeProvider};
use crate::errors::XCoreError;

pub struct ToolchainRegistry {
    pub providers: Vec<Box<dyn ToolchainProvider>>,
    pub installed_manifests: HashMap<String, ToolchainManifest>,
}

static REGISTRY_INSTANCE: OnceLock<Arc<Mutex<ToolchainRegistry>>> = OnceLock::new();

pub fn get_toolchain_registry() -> &'static Arc<Mutex<ToolchainRegistry>> {
    REGISTRY_INSTANCE.get_or_init(|| {
        let mut registry = ToolchainRegistry {
            providers: vec![
                Box::new(GccProvider),
                Box::new(ClangProvider),
                Box::new(RustProvider),
                Box::new(NodeProvider),
            ],
            installed_manifests: HashMap::new(),
        };
        registry.scan_and_register_system_toolchains();
        Arc::new(Mutex::new(registry))
    })
}

pub fn resolve_app_data_toolchain_dir(scope: ToolchainScope) -> PathBuf {
    let base_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("x-editor-data"))
        .join("x-editor")
        .join("toolchains");

    match scope {
        ToolchainScope::Global => base_dir.join("global"),
        ToolchainScope::User => base_dir.join("user"),
        ToolchainScope::Project => base_dir.join("global"),
    }
}

impl ToolchainRegistry {
    pub fn scan_and_register_system_toolchains(&mut self) {
        for provider in &self.providers {
            let detected = provider.detect_installed();
            for manifest in detected {
                self.installed_manifests.insert(manifest.id.clone(), manifest);
            }
        }
    }

    pub fn list_available_toolchains(&self) -> Vec<ToolchainManifest> {
        let mut available = Vec::new();
        for provider in &self.providers {
            available.extend(provider.list_available());
        }
        available
    }

    pub fn list_installed_toolchains(&self) -> Vec<ToolchainManifest> {
        self.installed_manifests.values().cloned().collect()
    }

    pub fn register_installed_toolchain(&mut self, manifest: ToolchainManifest) -> Result<(), XCoreError> {
        self.installed_manifests.insert(manifest.id.clone(), manifest);
        Ok(())
    }

    pub fn remove_installed_toolchain(&mut self, id: &str) -> Result<(), XCoreError> {
        if let Some(manifest) = self.installed_manifests.remove(id) {
            if let Some(path_str) = manifest.installation_path {
                if path_str != "system" {
                    let path = PathBuf::from(path_str);
                    if path.exists() {
                        let _ = fs::remove_dir_all(path);
                    }
                }
            }
            Ok(())
        } else {
            Err(XCoreError::ToolchainNotFound(id.to_string()))
        }
    }

    pub fn validate_installed_executable(&self, manifest: &ToolchainManifest) -> bool {
        if manifest.status == ToolchainStatus::Installed {
            if let Some(path_str) = &manifest.installation_path {
                if path_str == "system" {
                    return true;
                }
                let install_dir = PathBuf::from(path_str);
                for exec_rel in manifest.executable_paths.values() {
                    let exec_path = install_dir.join(exec_rel);
                    if !exec_path.exists() {
                        return false;
                    }
                }
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_data_toolchain_dir_resolution() {
        let global_dir = resolve_app_data_toolchain_dir(ToolchainScope::Global);
        let user_dir = resolve_app_data_toolchain_dir(ToolchainScope::User);

        assert!(global_dir.to_string_lossy().contains("global"));
        assert!(user_dir.to_string_lossy().contains("user"));
    }

    #[test]
    fn test_system_toolchain_detection() {
        let reg_arc = get_toolchain_registry();
        let reg = reg_arc.lock().unwrap();
        let installed = reg.list_installed_toolchains();
        assert!(!installed.is_empty());
    }
}
