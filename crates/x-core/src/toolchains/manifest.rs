use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolchainStatus {
    Available,
    Installed,
    Active,
    Invalid,
    VerificationFailed,
    Installing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerificationState {
    ChecksumVerified,
    SignatureVerified,
    InstallationValidated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolchainScope {
    Global,
    User,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolchainManifest {
    pub id: String,
    pub name: String,
    pub language: String,
    pub version: String,
    pub platform: String,
    pub architecture: String,
    pub distribution: String,
    pub source_url: String,
    pub download_url: String,
    pub sha256_checksum: String,
    pub signature: Option<String>,
    pub license: String,
    pub installation_path: Option<String>,
    #[serde(default)]
    pub executable_paths: HashMap<String, String>,
    #[serde(default)]
    pub environment_variables: HashMap<String, String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub scope: ToolchainScope,
    pub status: ToolchainStatus,
    #[serde(default)]
    pub verification_states: Vec<VerificationState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectToolchainConfig {
    pub version: u32,
    #[serde(default)]
    pub toolchains: Vec<ProjectToolchainRequirement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectToolchainRequirement {
    pub language: String,
    pub distribution: String,
    pub version: String,
}

impl Default for ProjectToolchainConfig {
    fn default() -> Self {
        Self {
            version: 1,
            toolchains: Vec::new(),
        }
    }
}
