// GitHub account: sign in with the device flow, browse and clone your repositories.
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, ExternalLink, Lock, LogOut, Star, Download } from "lucide-solid";
import { ipc } from "../lib/ipc";
import { fuzzyFilter } from "../lib/fuzzy";
import { appInfo } from "../state/ui";
import { cancelSignIn, deviceCode, signIn, signOut, signingIn, user } from "../state/auth";
import { cloneRepository } from "../state/actions";
import { GithubMark } from "./Icons";
import { writeText } from "./clipboard";

export function SignInCard() {
  return (
    <div class="signin-card">
      <Show
        when={deviceCode()}
        fallback={
          <>
            <p class="muted">Sign in to clone and push to your repositories, and to sign commits with your GitHub identity.</p>
            <Show when={appInfo()?.githubConfigured} fallback={<p class="small c-warning">GitHub sign-in isn't configured in this build. See docs/GITHUB_LOGIN.md to add an OAuth client ID.</p>}>
              <button class="btn btn-github btn-block" disabled={signingIn()} onClick={signIn}>
                <GithubMark size={15} /> Sign in with GitHub
              </button>
            </Show>
          </>
        }
      >
        {(code) => (
          <div class="device-code">
            <p>Enter this code on GitHub (it's on your clipboard):</p>
            <button class="code-box" title="Copy code" onClick={() => writeText(code().userCode)}>
              {code().userCode} <Copy size={14} />
            </button>
            <div class="row gap">
              <button class="btn btn-sm" onClick={() => openUrl(code().verificationUri)}><ExternalLink size={13} /> Open github.com</button>
              <button class="btn btn-sm btn-ghost" onClick={cancelSignIn}>Cancel</button>
            </div>
            <p class="muted small">Waiting for you to approve…</p>
          </div>
        )}
      </Show>
    </div>
  );
}

export function RepoList(p: { limit?: number }) {
  const [repos] = createResource(() => user()?.login, () => ipc.auth.repos());
  const [q, setQ] = createSignal("");
  const shown = createMemo(() => fuzzyFilter(q(), repos() ?? [], (r) => r.fullName, p.limit ?? 100).map((r) => r.item));
  return (
    <div class="repo-list">
      <input class="input" placeholder="Filter repositories" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
      <Show when={!repos.loading} fallback={<p class="muted">Loading repositories…</p>}>
        <Show when={!repos.error} fallback={<p class="c-danger small">{String(repos.error)}</p>}>
          <For each={shown()} fallback={<p class="muted small">No repositories found.</p>}>
            {(r) => (
              <div class="repo-row">
                <div class="repo-main">
                  <div class="repo-name">
                    <Show when={r.private}><Lock size={11} /></Show> {r.fullName}
                  </div>
                  <Show when={r.description}><div class="repo-desc">{r.description}</div></Show>
                  <div class="repo-meta">
                    <Show when={r.language}><span>{r.language}</span></Show>
                    <span><Star size={11} /> {r.stargazersCount}</span>
                  </div>
                </div>
                <button class="btn btn-sm" title="Clone" onClick={() => cloneRepository(r.cloneUrl)}><Download size={13} /> Clone</button>
              </div>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
}

export function AccountView() {
  return (
    <div class="sidebar-view">
      <div class="sidebar-header"><span class="sidebar-title">GitHub</span></div>
      <div class="scroll pad-x">
        <Show when={user()} fallback={<SignInCard />}>
          {(u) => (
            <>
              <div class="profile">
                <img class="avatar-lg" src={u().avatarUrl} alt="" />
                <div class="profile-text">
                  <div class="profile-name">{u().name ?? u().login}</div>
                  <button class="link" onClick={() => openUrl(u().htmlUrl)}>@{u().login}</button>
                </div>
                <button class="icon-btn" title="Sign out" onClick={signOut}><LogOut size={15} /></button>
              </div>
              <button class="btn btn-block" onClick={() => cloneRepository()}>Clone from URL…</button>
              <h4 class="section-title">Your repositories</h4>
              <RepoList />
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
