# Releasing X-Editor

Releases are built by `.github/workflows/release.yml` on GitHub's Windows, macOS and Linux
runners.

## Cutting a release

1. Bump the version in `Cargo.toml` (`[workspace.package] version`), in
   `apps/desktop/src-tauri/tauri.conf.json` and in `apps/desktop/ui/package.json`.
2. Commit, then tag and push:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. The workflow builds:
   - **Windows:** `.msi` and `.exe` (NSIS) installers
   - **macOS:** `.dmg` for Apple Silicon and Intel
   - **Linux:** `.deb`, `.rpm` and `.AppImage`

   It then attaches them to a **draft** GitHub Release. Review it and click Publish.

## Secrets

| Secret | Needed for |
|---|---|
| `XE_GITHUB_CLIENT_ID` | Sign in with GitHub (see GITHUB_LOGIN.md) |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` | Signing the macOS app (Apple Developer Program, $99/year) |
| `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID` | Notarizing the macOS app, so Gatekeeper doesn't block it |

Without the Apple secrets, the macOS build still works, but people have to right-click → Open
the first time. On Windows, unsigned installers show a SmartScreen warning until the app builds
a reputation. A code-signing certificate (for example an OV/EV certificate, or Azure Trusted
Signing) removes it. See https://v2.tauri.app/distribute/sign/windows/.

## Stores

Once signing is set up, the same bundles can go to the Microsoft Store (MSIX), the Mac App
Store (needs sandboxing work, see the roadmap), Flathub, Snapcraft, Homebrew Cask and winget.
