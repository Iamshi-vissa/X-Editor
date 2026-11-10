// What's installed vs. what this project asks for, and which language servers are available.
// Everything here is detected for real; install buttons run visible commands in a terminal.
import { For, Show, createResource } from "solid-js";
import { Check, RefreshCw, TriangleAlert, Play, Circle } from "lucide-solid";
import { ipc } from "../lib/ipc";
import { settings } from "../state/settings";
import { workspace } from "../state/workspace";
import { runCommandInTerminal, runProject } from "../state/actions";
import { lspStatus } from "../editor/lsp";

const HINTS: Record<string, { name: string; how: string }> = {
  node: { name: "Node.js", how: "Use mise, fnm or nvm to install the requested version" },
  python: { name: "Python", how: "Use mise, uv or pyenv to install the requested version" },
  rust: { name: "Rust", how: "rustup reads rust-toolchain.toml automatically" },
  go: { name: "Go", how: "Go 1.21+ downloads the toolchain named in go.mod automatically" },
  java: { name: "Java", how: "Use mise or SDKMAN to install the requested JDK" },
};

export function RuntimesView() {
  const [report, { refetch }] = createResource(() => workspace()?.root ?? "none", () => ipc.runtime.report());
  const servers = () => Object.entries(settings["lsp.servers"]);
  const [lspAvail, { refetch: refetchLsp }] = createResource(
    () => servers().map(([, s]) => s.command).join(","),
    () => ipc.lsp.available(servers().map(([, s]) => s.command)),
  );
  const hasMise = () => report()?.installed.some((r) => r.id === "mise");
  const installedFor = (cmd: string) => lspAvail()?.find((a) => a.command === cmd)?.installed;

  return (
    <div class="sidebar-view">
      <div class="sidebar-header">
        <span class="sidebar-title">Runtimes</span>
        <div class="sidebar-actions">
          <button class="icon-btn" title="Run project" onClick={runProject}><Play size={14} /></button>
          <button class="icon-btn" title="Detect again" onClick={() => { refetch(); refetchLsp(); }}><RefreshCw size={14} /></button>
        </div>
      </div>
      <div class="scroll pad-x">
        <Show when={workspace()}>
          <h4 class="section-title">This project needs</h4>
          <Show when={!report.loading} fallback={<p class="muted">Checking…</p>}>
            <For each={report()?.requirements ?? []} fallback={<p class="muted small">No version files found (.nvmrc, .python-version, rust-toolchain.toml, go.mod, .tool-versions, mise.toml, engines in package.json).</p>}>
              {(r) => (
                <div class={`req-card ${r.satisfied === false ? "bad" : r.satisfied ? "good" : ""}`}>
                  <div class="req-top">
                    <span class="req-name">{HINTS[r.runtime]?.name ?? r.runtime}</span>
                    <span class="req-status">
                      {r.satisfied === true ? <><Check size={13} /> OK</> : r.satisfied === false ? <><TriangleAlert size={13} /> Mismatch</> : <><Circle size={11} /> Can't check</>}
                    </span>
                  </div>
                  <div class="req-detail">wants <b>{r.requested}</b> ({r.source}) · have <b>{r.installedVersion ?? "not installed"}</b></div>
                  <Show when={r.satisfied === false}>
                    <div class="req-fix">
                      <Show when={hasMise()} fallback={<span class="muted small">{HINTS[r.runtime]?.how ?? "Install the requested version with your version manager."}</span>}>
                        <button class="btn btn-sm" onClick={() => runCommandInTerminal("mise install")}>Install with mise</button>
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </Show>

        <h4 class="section-title">Installed on this computer</h4>
        <Show when={!report.loading} fallback={<p class="muted">Scanning PATH…</p>}>
          <div class="runtime-grid">
            <For each={report()?.installed ?? []}>
              {(r) => (
                <div class="runtime-chip" title={r.path}>
                  <span class="runtime-name">{r.name}</span>
                  <span class="runtime-ver">{r.version ?? "?"}</span>
                </div>
              )}
            </For>
          </div>
        </Show>

        <h4 class="section-title">Language servers</h4>
        <p class="muted small">These power autocomplete, go to definition, rename and inline errors. Add more in settings under "lsp.servers".</p>
        <For each={servers()}>
          {([key, s]) => (
            <div class="lsp-row">
              <span class={`lsp-state ${installedFor(s.command) ? "on" : "off"}`} />
              <div class="lsp-info">
                <div class="lsp-name">{key} <span class="muted">· {s.command}</span></div>
                <div class="muted small">{s.languages.join(", ")}{lspStatus[key] ? ` · ${lspStatus[key]}` : ""}</div>
              </div>
              <Show when={lspAvail() && !installedFor(s.command) && s.install}>
                <Show when={!s.install!.startsWith("Install ")} fallback={<span class="muted small" title={s.install}>manual</span>}>
                  <button class="btn btn-sm" title={s.install} onClick={() => runCommandInTerminal(s.install!)}>Install</button>
                </Show>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
