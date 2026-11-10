//! Runtimes: finds which language runtimes are installed, reads which versions a
//! project asks for (.nvmrc, .python-version, rust-toolchain.toml, go.mod, .tool-versions,
//! mise.toml, package.json engines...), and builds the command to run a file or project.

pub mod detect;
pub mod run;
