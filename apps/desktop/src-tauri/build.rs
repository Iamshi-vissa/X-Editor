fn main() {
    println!("cargo:rerun-if-env-changed=XE_GITHUB_CLIENT_ID");
    tauri_build::build()
}
