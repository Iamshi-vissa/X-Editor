# X-Editor — Premium Desktop Code Editor & Toolchain Manager

[![Rust Workspace](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React + TypeScript](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D8.svg)](https://tauri.app/)
[![Monaco Editor](https://img.shields.io/badge/Monaco-Editor-1E1E1E.svg)](https://microsoft.github.io/monaco-editor/)
[![Theme](https://img.shields.io/badge/Theme-Black%20%26%20Violet-8b5cf6.svg)](https://github.com/)

**X-Editor** is an ultra-fast, local-first code editor and development environment built from scratch. Powered by a modern stack of React 18, TypeScript, Tailwind CSS v4, Monaco Editor, Tauri v2 IPC, and a strongly decoupled Rust core engine (`x-core`, `x-filesystem`, `x-process`, `x-security`).

---

## ⚡ Core Features & Highlights

### 🎨 Black & Violet Premium Design System
* **Custom Color Palette**: Custom dark background (`#0e0e14`), sidebar (`#141019`), and signature violet accent highlights (`#8b5cf6`).
* **Recolored Code Intelligence**: Custom Monaco syntax rules recoloring keywords, types, functions, comments, and variables into violet/lavender/magenta tones.
* **Color Theme Switcher**: Built-in Theme Picker supporting Purple Dark, Cyberpunk Midnight, and Light Modern.

### 🛠️ Advanced Toolchain Management
* **Runtime Detection**: Automatic discovery of installed system compilers and language runtimes (Node.js, Python, Rust, Go, GCC/MinGW, JDK).
* **Version Mismatch Detection**: Scans project engine declarations (`package.json`, `.python-version`, `Cargo.toml`) against active runtimes and flags version mismatches.
* **One-Click Fix Button**: 1-click automatic environment fix button that sets active toolchain versions and writes settings to `.toolchain.json`.
* **Toolchain Logs & Status Bar**: Real-time installation and execution logs streamed to the bottom panel's **Toolchain Logs** tab, with active runtimes displayed live in the Status Bar.

### 💻 Rich Editing & Multi-Pane Layout
* **Split Editor View (`Ctrl+\`)**: Side-by-side dual editor panes for editing multiple files simultaneously.
* **Breadcrumb Navigation**: Interactive file hierarchy trail displayed above Monaco Editor.
* **Tab Management**: Multi-tab editing with dirty-state indicator dots (`•`), close-on-hover, and auto-recovery.
* **Code Intelligence**: Minimap, bracket pair colorization, line numbers, and current line highlighting.

### 🚀 Search & Command Overlays
* **Command Palette (`Ctrl+Shift+P` / `F1`)**: Centered modal overlay for fuzzy searching IDE actions, task triggers, and toolchain configurations.
* **Quick Open (`Ctrl+P`)**: Instant file search modal for rapid workspace file jumping.
* **Global Search & Replace (`Ctrl+Shift+F`)**: Workspace-wide text search and replace.

### 🌿 Source Control & Integrated Terminal
* **Git Source Control**: Side panel for tracking branch status (`main*`), staged/unstaged changes, and inline commit/push.
* **Integrated Terminal (`Ctrl+\``)**: Multi-tab terminal drawer running native PowerShell and CMD child processes.
* **Extensions Marketplace**: Extensions view for managing language extensions (Rust Analyzer, C/C++ Tools, Python, Tailwind CSS IntelliSense).

---

## 🏗️ Architecture

```mermaid
graph TD
    User([User]) --> UI[React 18 + Tailwind v4 + Monaco Editor]
    UI --> Stores[Zustand Stores<br/>TaskStore | DocumentStore | WorkspaceStore | TerminalStore | ToolchainStore]
    Stores --> TypedIPC[Typed IPC Service Layer]
    TypedIPC --> TauriIPC[Tauri v2 IPC Commands & Events]
    TauriIPC --> XCore[crates/x-core<br/>TaskRunner & Toolchain Engine]
    
    subgraph Core Engine Modules
        XCore --> XSecurity[crates/x-security<br/>Path Validation & Sandboxing]
        XCore --> XFilesystem[crates/x-filesystem<br/>File I/O & Watcher]
        XCore --> XProcess[crates/x-process<br/>Async Stream Manager]
    end

    XProcess --> OSProcess[Child OS Process<br/>GCC / Clang / Rustc / Node / Python]
    XFilesystem --> RealFS[Real Disk Filesystem]
```

---

## 📁 Repository Structure

```
.
├── apps/
│   └── desktop/
│       ├── frontend/          # React 18, TypeScript, Tailwind v4, Monaco UI & Themes
│       └── src-tauri/         # Tauri v2 Desktop app & Rust IPC handlers
├── crates/
│   ├── x-core/                # Task runner, compiler problem matcher & toolchain engine
│   ├── x-filesystem/          # Local file operations, workspace search & file watcher
│   ├── x-process/             # Async process execution & stdout/stderr stream manager
│   └── x-security/           # Workspace trust policies & path validation
├── .toolchain.json            # Project toolchain environment configuration
└── Cargo.toml                 # Workspace Cargo manifest
```

---

## 🛠️ Development Setup

### Prerequisites
* [Node.js](https://nodejs.org/) v18+ & `npm`
* [Rust](https://www.rust-lang.org/) stable toolchain (`cargo`, `rustc`)
* MinGW-w64 (Windows GCC toolchain)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Desktop Development Server
```powershell
$env:PATH="C:\msys64\mingw64\bin;" + $env:PATH; $env:WINDRES="C:\msys64\mingw64\bin\windres.exe"; npx @tauri-apps/cli dev
```

### 3. Run Core Workspace Unit Tests
```bash
cargo test -p x-core -p x-security -p x-process -p x-filesystem
```

---

## 📄 License

Distributed under the MIT License.