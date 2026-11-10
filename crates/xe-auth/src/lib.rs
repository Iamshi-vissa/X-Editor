//! GitHub sign-in with the OAuth Device Flow. Desktop apps can't keep a client secret,
//! and the device flow doesn't need one: the user types a short code on github.com and
//! the app polls until it's approved. The token is kept in the OS keychain.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

const KEYRING_SERVICE: &str = "dev.xeditor.app";
const KEYRING_USER: &str = "github-token";
pub const SCOPES: &str = "repo read:user user:email";

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("GitHub sign-in isn't configured: no OAuth client ID. See docs/GITHUB_LOGIN.md")]
    NoClientId,
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("the sign-in code expired, please try again")]
    Expired,
    #[error("sign-in was cancelled")]
    Cancelled,
    #[error("GitHub refused the sign-in: {0}")]
    Denied(String),
    #[error("couldn't store the token in the system keychain: {0}")]
    Keyring(String),
}

impl serde::Serialize for AuthError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AuthError>;

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("X-Editor/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("http client")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

pub async fn start_device_flow(client_id: &str) -> Result<DeviceCode> {
    if client_id.trim().is_empty() {
        return Err(AuthError::NoClientId);
    }
    let resp = client()
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", SCOPES)])
        .send()
        .await?;
    let value: serde_json::Value = resp.json().await?;
    if let Some(err) = value.get("error").and_then(|e| e.as_str()) {
        let desc = value.get("error_description").and_then(|d| d.as_str()).unwrap_or(err);
        return Err(AuthError::Denied(desc.to_string()));
    }
    serde_json::from_value(value).map_err(|e| AuthError::Denied(e.to_string()))
}

/// Polls GitHub until the user approves the code, it expires, or `cancel` is set.
pub async fn wait_for_token(client_id: &str, code: &DeviceCode, cancel: Arc<AtomicBool>) -> Result<String> {
    let mut interval = code.interval.max(5);
    let deadline = std::time::Instant::now() + Duration::from_secs(code.expires_in);
    let http = client();
    loop {
        for _ in 0..interval * 4 {
            if cancel.load(Ordering::Relaxed) {
                return Err(AuthError::Cancelled);
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        if std::time::Instant::now() > deadline {
            return Err(AuthError::Expired);
        }
        let value: serde_json::Value = http
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
                ("device_code", code.device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await?
            .json()
            .await?;
        if let Some(token) = value.get("access_token").and_then(|t| t.as_str()) {
            return Ok(token.to_string());
        }
        match value.get("error").and_then(|e| e.as_str()) {
            Some("authorization_pending") => {}
            Some("slow_down") => interval += 5,
            Some("expired_token") => return Err(AuthError::Expired),
            Some("access_denied") => return Err(AuthError::Denied("you declined the request".into())),
            Some(other) => {
                let desc = value.get("error_description").and_then(|d| d.as_str()).unwrap_or(other);
                return Err(AuthError::Denied(desc.to_string()));
            }
            None => return Err(AuthError::Denied("unexpected response from GitHub".into())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct GithubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub html_url: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub id: u64,
}

pub async fn fetch_user(token: &str) -> Result<GithubUser> {
    let http = client();
    let mut user: GithubUser = http
        .get("https://api.github.com/user")
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if user.email.is_none() {
        // Private emails aren't on /user; fall back to GitHub's noreply address for commits.
        user.email = Some(format!("{}+{}@users.noreply.github.com", user.id, user.login));
    }
    Ok(user)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct GithubRepo {
    pub full_name: String,
    pub description: Option<String>,
    pub private: bool,
    pub clone_url: String,
    pub html_url: String,
    pub language: Option<String>,
    pub stargazers_count: u64,
    pub updated_at: Option<String>,
}

pub async fn list_repos(token: &str) -> Result<Vec<GithubRepo>> {
    let repos: Vec<GithubRepo> = client()
        .get("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member")
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(repos)
}

fn entry() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| AuthError::Keyring(e.to_string()))
}

pub fn save_token(token: &str) -> Result<()> {
    entry()?.set_password(token).map_err(|e| AuthError::Keyring(e.to_string()))
}

pub fn load_token() -> Option<String> {
    entry().ok()?.get_password().ok()
}

pub fn delete_token() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AuthError::Keyring(e.to_string())),
    }
}
