# X-Editor — Next-Generation High Performance Desktop IDE

[![Rust Workspace](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React + TypeScript](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D8.svg)](https://tauri.app/)
[![Monaco Editor](https://img.shields.io/badge/Monaco-Editor-1E1E1E.svg)](https://microsoft.github.io/monaco-editor/)

**X-Editor** is a modular, ultra-fast, local-first code editor and development environment built on top of React 18, TypeScript, Tailwind CSS v4, Monaco Editor, Tauri v2 IPC, and a strongly decoupled Rust core engine (`x-core`, `x-filesystem`, `x-process`, `x-security`).

---

## 🚀 Key Features & Architectural Phases

### Phase 1 — Foundational End-to-End Vertical Slice
* **Monaco Editor Integration**: Multi-document tab management, theme switching, auto-save state, and real-time content synchronization.
* **Security & Path Authorization**: Enforces strict workspace sandboxing in `x-security`, preventing directory traversal attacks outside the open project directory.
* **Tauri IPC Engine**: Fully typed asynchronous IPC bridge connecting React UI to native Rust command handlers.

### Phase 2 — Workspace, Process & Integrated Terminal Infrastructure
* **Async Process Management (`x-process`)**: Asynchronous process spawning, stdin writing, chunked stdout/stderr output streaming, and child process termination without blocking the main UI thread.
* **Workspace File Watcher & Search**: Live file system change detection (`create`, `modify`, `remove`, `rename`) via `notify` and rapid multi-file workspace content searching via `walkdir`.
* **Integrated Terminal Drawer**: Multi-tab terminal interface with live stdout/stderr log rendering, command prompt, and execution controls.

### Phase 3 — Build, Run, Task Runner & Compiler Execution
* **Project Task Configuration**: Structured JSON schema support via `.x-editor/tasks.json` for project-defined `Build`, `Run`, `Clean`, and `Custom` tasks.
* **Dependency Resolution & Cycle Detection**: Topological graph sorter executing task dependency chains (e.g., `Clean` → `Build` → `Run`) while detecting circular dependency graphs (e.g. `A → B → A`).
* **Compiler Problem Matcher**: Regular expression output parser extracting structured errors, warnings, and info messages for GCC, Clang, `rustc`, MSVC, and generic toolchains.
* **Problems Panel & Monaco Line Jump**: Interactive UI listing compiler problems. Clicking any error item opens the target document in Monaco and scrolls the cursor directly to the target line and column (`revealLineInCenter` & `setPosition`).
* **Workspace Trust Enforcement**: Restricts automated task execution in untrusted workspaces until explicitly authorized by the user.

---

## 🏗️ Architecture

```mermaid
graph TD
    User([User]) --> UI[React 18 + Tailwind v4 + Monaco Editor]
    UI --> Stores[Zustand Stores<br/>TaskStore | DocumentStore | WorkspaceStore | TerminalStore | SearchStore]
    Stores --> TypedIPC[Typed IPC Service Layer]
    TypedIPC --> TauriIPC[Tauri v2 IPC Commands & Events]
    TauriIPC --> XCore[crates/x-core<br/>TaskRunner & TaskResolver]
    
    subgraph Core Engine Modules
        XCore --> XSecurity[crates/x-security<br/>Path Validation & Workspace Trust]
        XCore --> XFilesystem[crates/x-filesystem<br/>File I/O, Search & Watcher]
        XCore --> XProcess[crates/x-process<br/>Async Command & Stream Manager]
    end

    XProcess --> OSProcess[Child OS Process<br/>GCC / Clang / Rustc / Node]
    XFilesystem --> RealFS[Real Disk Filesystem]
```

---

## 📁 Repository Structure

```
.
├── apps/
│   └── desktop/
│       ├── frontend/          # React 18, TypeScript, Tailwind v4, Monaco Editor UI
│       └── src-tauri/         # Tauri v2 Desktop entry point & IPC command handlers
├── crates/
│   ├── x-core/                # Task runner, task graph resolver, compiler problem matcher
│   ├── x-filesystem/          # Local file operations, workspace search & file watcher
│   ├── x-process/             # Async process execution & stdout/stderr stream manager
│   └── x-security/           # Workspace trust policies & path traversal validation
├── .x-editor/                 # Project configuration directory (tasks.json, settings.json)
└── Cargo.toml                 # Workspace Cargo manifest
```

---

## 🛠️ Development Setup

### Prerequisites
* [Node.js](https://nodejs.org/) v18+ & `npm`
* [Rust](https://www.rust-lang.org/) stable toolchain (`cargo`, `rustc`)

### 1. Install Dependencies
```bash
# Install frontend dependencies
cd apps/desktop/frontend
npm install
```

### 2. Run Local Development Frontend
```bash
npm run dev
```

### 3. Run Rust Workspace Unit Tests
```bash
# Run tests across all core crates (x-core, x-filesystem, x-process, x-security)
cargo test -p x-core -p x-security -p x-process -p x-filesystem
```

### 4. Build Production Bundle
```bash
# Build frontend production bundle
cd apps/desktop/frontend
npm run build
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.