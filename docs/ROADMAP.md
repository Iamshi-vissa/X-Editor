# X-Editor roadmap

X-Editor's goal: **the speed of a text editor, the power of an IDE, and nothing fake in
between.** Each phase ships something people can use, and nothing is shown in the UI before it
works.

## Phase 1: Foundation ✅ (this release)

- Rust core in seven crates: files, PTY terminal, Git, GitHub auth, LSP bridge, runtimes, config
- SolidJS + CodeMirror 6 interface: tabs, split view, palette, settings, themes
- Flow / Studio modes
- Language servers (completion, hover, definition, references, rename, format, diagnostics)
- Real terminal, Run File / Run Project
- Git panel, diffs, gutter markers, push / pull / clone, GitHub sign-in
- Runtime detection against project version files
- CI on three platforms and a release workflow with signed-build support

## Phase 2: Daily-driver polish (next)

- **Problems panel** listing diagnostics across all open files, with click-to-jump
- **Outline and symbol search** (`@` in the palette) through LSP document symbols
- **Minimap** and sticky scroll (current function pinned at the top)
- Dim git-ignored files in the explorer; drag-and-drop files and folders in the tree
- **Inline blame** and file history; stage individual hunks from the gutter
- **Auto-update** through Tauri's signed updater
- Large-file mode (read-only, chunked) for multi-GB logs
- Tasks: run `package.json` scripts, `Makefile` targets and `cargo` commands from a list
- Vim and Emacs keymaps (`@replit/codemirror-vim` / emacs)

## Phase 3: Full IDE

- **Debugger** through the Debug Adapter Protocol (DAP): breakpoints, call stack, variables,
  watch, and a debug console for Node, Python (debugpy), Rust/C/C++ (CodeLLDB) and Go (Delve)
- **Test explorer** that discovers and runs tests per file or per test, with gutter results
- **One-click runtime install** through mise / rustup / uv, showing progress in the terminal
- Multi-root workspaces
- Notebook view for `.ipynb`

## Phase 4: Platform

- **Extension API**: extensions written in TypeScript, running in a sandboxed worker with
  explicit permissions (files, terminal, network), plus a theme and language marketplace
- **Settings sync** through a private GitHub Gist, using the existing GitHub login
- Profiles (for example "Writing", "Rust", "Web") that switch settings, keymaps and layout

## Phase 5: Future-scoped

- **AI pair programmer**: inline completions, "explain this error" in the Problems panel,
  natural-language edits as reviewable diffs, and a chat that can read the workspace. Bring your
  own key or use a local model, and it's off unless you turn it on.
- **Real-time collaboration**: shared editing over CRDTs (Yjs), shared terminals, and follow
  mode
- **Remote development**: open a folder over SSH, in a container or in WSL, with the Rust core
  running on the remote machine
- **Pull requests in the editor**: review, comment and approve GitHub PRs inline
- Web / tablet edition: the same SolidJS UI, with the Rust core compiled to WebAssembly or
  running on a server

## Principles

1. **Fast first.** Startup under 300 ms on a modern laptop, typing latency under one frame, and
   no work on the UI thread that could happen in Rust.
2. **Honest UI.** Nothing appears in the interface until it works.
3. **Your machine, your data.** No telemetry by default, secrets in the OS keychain, and
   everything stored as plain JSON you can edit.
4. **Customisable without code.** Every colour, shortcut and layout choice is a setting.
