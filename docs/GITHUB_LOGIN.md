# Enabling "Sign in with GitHub"

X-Editor signs in with GitHub's **device flow**: the app shows a short code, you approve it on
github.com, and the app receives a token. Desktop apps can't keep a secret, and the device flow
doesn't need one, so only a public **client ID** is required.

## 1. Create a GitHub OAuth App (about two minutes)

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (https://github.com/settings/applications/new). To own it as an organization, use the
   organization's settings instead.
2. Fill in:
   - **Application name:** `X-Editor`
   - **Homepage URL:** your project or website URL, e.g. `https://github.com/Iamshi-vissa/X-Editor`
   - **Authorization callback URL:** the same URL. The device flow doesn't use it, but GitHub
     requires a value.
3. Click **Register application**.
4. On the app's page, tick **Enable Device Flow** and save.
5. Copy the **Client ID** (it starts with `Ov23` or `Iv1`). You don't need a client secret,
   so don't generate one.

## 2. Give the client ID to X-Editor

Pick one of these:

- **Release builds (recommended):** add a repository secret named `XE_GITHUB_CLIENT_ID`
  (GitHub repo → Settings → Secrets and variables → Actions). The release workflow compiles it
  into the app.
- **Local builds:** set the variable before building or running:

  ```bash
  XE_GITHUB_CLIENT_ID=Ov23liXXXXXXXXXXXXXX npm run dev
  ```

- **Without rebuilding:** put it in `settings.json` as `"github.clientId": "Ov23li…"`, or enter
  it under Settings → GitHub.

## What the app can access

The app requests the `repo`, `read:user` and `user:email` scopes, which it needs to clone and
push private repositories and to sign commits with your name. The token is stored in the OS
keychain (macOS Keychain, Windows Credential Manager, or Secret Service on Linux). It is never
written to disk in plain text. Signing out deletes it. Users can also revoke access at any time
from https://github.com/settings/applications.
