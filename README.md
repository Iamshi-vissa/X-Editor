# X-Editor — High-Performance Desktop IDE & Advanced Toolchain Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Rust Workspace](https://img.shields.io/badge/Rust Core-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/Frontend-React%2018-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%205.3-blue.svg)](https://www.typescriptlang.org/)
[![Tauri Framework](https://img.shields.io/badge/Desktop Engine-Tauri%20v2-24C8D8.svg)](https://tauri.app/)
[![Design Tokens](https://img.shields.io/badge/Design-Black%20%26%20Violet-8b5cf6.svg)](https://tailwindcss.com/)

**X-Editor** is an enterprise-grade, local-first code editor and development environment engineered for maximum execution speed, deep toolchain control, and zero-latency code navigation. Built on a strongly decoupled architecture combining **React 18**, **TypeScript**, **Tailwind CSS v4**, **Monaco Editor**, and **Tauri v2 IPC** with a multi-crate **Rust Core Engine**, X-Editor delivers workstation-class desktop IDE capabilities paired with custom runtime management.

---

## 🏛️ Executive Summary & System Philosophy

Standard code editors isolate runtime management from the editor layer, forcing developers to rely on separate CLI tools (`nvm`, `pyenv`, `rustup`) and manual configuration files. 

**X-Editor** unifies code editing and runtime lifecycle management into a single native application:
- **Local-First Security**: Enforces sandboxed file access validation (`x-security`) preventing unauthorized disk access.
- **Asynchronous IPC Subsystem**: Offloads terminal streaming, file watching, and compiler processes (`x-process`, `x-filesystem`) to background OS threads without blocking the 60fps UI loop.
- **Active Environment Resolution**: Continuously validates project declarations (e.g., `package.json` engines, `.python-version`, `Cargo.toml`) against active system runtimes and offers one-click automated remediation.

---

## 📖 Comprehensive System Walkthrough & User Guide

### 1. Black & Violet Theme Token System
X-Editor features a custom-engineered Black & Violet design system defined in a centralized token schema ([themeTokens.ts](file:///c:/Users/bhara/OneDrive/Desktop/project-1/apps/desktop/frontend/src/styles/themeTokens.ts)):
- **Editor Background**: `#0e0e14` (Deep obsidian)
- **Sidebar & Surface Panels**: `#141019` (Low-contrast dark violet)
- **Primary Accent**: `#8b5cf6` (Signature violet highlight)
- **Custom Monaco Token Mapping**: Keywords (`#a855f7`), Strings (`#c4b5fd`), Functions (`#d8b4fe`), Types/Classes (`#e9d5ff`), Comments (`#7a7590`), Numbers (`#c084fc`), and Variables (`#e4e0f0`).

* **How to use**: Click the **Theme** icon (Palette) at the bottom of the Activity Bar to open the **Color Theme Picker** modal and switch between *Purple Dark*, *Cyberpunk Midnight*, and *Light Modern*.

### 2. Multi-Pane Code Editing & Navigation
- **Split Editor View (`Ctrl+\`)**: Divide the central workspace into dual side-by-side Monaco editor instances for simultaneous multi-file editing.
- **Tab Management**: Supports pinned tabs, unsaved dirty-state indicators (`•`), and close-on-hover actions.
- **Breadcrumb Navigation Bar**: Interactive file path hierarchy bar rendered directly below tabs for rapid parent-directory traversal.
- **Minimap & Bracket Pair Colorization**: Real-time code structure visualization along the right edge of the editor.

### 3. Command Palette & Quick File Open
- **Command Palette (`Ctrl+Shift+P` / `F1`)**: Centered modal overlay supporting fuzzy search across all internal IDE commands, build tasks, toolchain detections, and preferences.
- **Quick Open (`Ctrl+P`)**: Dedicated file navigation search with instant workspace path matching.

### 4. Advanced Toolchain Management Engine
- **Runtime Discovery**: Automatically detects installed system compilers and runtimes including Node.js, Python, Rust (`cargo`/`rustc`), Go, and GCC/MinGW.
- **Version Mismatch Resolution**: Automatically flags mismatches between project manifests and currently active environment toolchains.
- **One-Click Fix Button**: Activates the required runtime version and generates a synchronized `.toolchain.json` file in the workspace root.
- **Toolchain Logs Panel**: Real-time installation, compilation, and environment synchronization logs streamed under the **Toolchain Logs** tab in the bottom drawer.

### 5. Integrated Terminal & Development Panels
- **Multi-Tab Terminal (`Ctrl+\``)**: Embedded terminal drawer running native PowerShell and CMD child process sessions with interactive stdin/stdout streaming.
- **Compiler Problem Matcher**: Parses compiler output (GCC, `rustc`, `tsc`) and populates the **Problems** panel. Clicking any problem entry auto-scrolls the Monaco editor to the exact error line and column.
- **Source Control (Git)**: Dedicated side panel tracking branch status (`main*`), staged/unstaged file diffs, and inline commit/push operations.
- **Extensions Marketplace**: Manage development extensions (Rust Analyzer, C/C++ IntelliSense, Python, Tailwind CSS).

---

## 🏗️ System Architecture

```mermaid
graph TD
    User([Developer User]) --> UI[React 18 + Tailwind v4 + Monaco Editor UI]
    UI --> Stores[Zustand State Stores<br/>DocumentStore | TaskStore | ToolchainStore | WorkspaceStore | TerminalStore]
    Stores --> IPC[Typed IPC Service Layer]
    IPC --> Tauri[Tauri v2 IPC Native Commands & Events]
    
    subgraph Core Engine Modules (Rust)
        Tauri --> XCore[crates/x-core<br/>Task Runner & Toolchain Resolver]
        XCore --> XSecurity[crates/x-security<br/>Path Validation & Sandboxing]
        XCore --> XFilesystem[crates/x-filesystem<br/>File I/O, Search & File Watcher]
        XCore --> XProcess[crates/x-process<br/>Async Process Execution & Stream Manager]
    end

    XProcess --> OS[Host OS Process Execution<br/>Node.js / Python / Rustc / GCC / Cargo]
    XFilesystem --> Disk[Host File System]
```

---

## 📁 Repository Structure

```
.
├── apps/
│   └── desktop/
│       ├── frontend/          # React 18, TypeScript, Tailwind CSS v4, Monaco Editor UI
│       └── src-tauri/         # Tauri v2 Desktop entry point & Rust IPC command handlers
├── crates/
│   ├── x-core/                # Task runner graph resolver, problem matcher & toolchain engine
│   ├── x-filesystem/          # Local file operations, recursive search & file watcher
│   ├── x-process/             # Async process execution & stdout/stderr stream manager
│   └── x-security/           # Workspace trust policies & path validation sandbox
├── .toolchain.json            # Project toolchain environment configuration
├── .x-editor/                 # Workspace-specific task and editor settings
└── Cargo.toml                 # Workspace Cargo manifest
```

---

## 🛠️ Getting Started

### System Requirements
- **Operating System**: Windows 10/11, macOS, or Linux
- **Node.js**: v18.0.0 or higher
- **Rust Toolchain**: `cargo` 1.75+
- **C/C++ Compiler**: MinGW-w64 (Windows GCC) or Clang

### Installation & Execution

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Iamshi-vissa/X-Editor.git
   cd X-Editor
   ```

2. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

3. **Launch Desktop Application in Development Mode**:
   ```powershell
   # PowerShell Environment Command
   $env:PATH="C:\msys64\mingw64\bin;" + $env:PATH; $env:WINDRES="C:\msys64\mingw64\bin\windres.exe"; npx @tauri-apps/cli dev
   ```

---

## 🧪 Verification & Test Suite

Run unit tests across all core Rust crates (`x-core`, `x-security`, `x-process`, `x-filesystem`):

```bash
cargo test -p x-core -p x-security -p x-process -p x-filesystem
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for full details.