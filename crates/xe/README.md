# xe

A small modal terminal text editor, written to learn how editors work. The
buffer, undo history, key handling and rendering are all in this crate.

```bash
cargo run -p xe --release -- path/to/file.rs
```

## How it is built

| File | What it does |
|---|---|
| `buffer.rs` | Text in a rope (`ropey`), atomic saves, and the single function that mutates the text |
| `history.rs` | Undo and redo as grouped changes |
| `syntax.rs` | Incremental parsing and highlighting with `tree-sitter` |
| `editor.rs` | Modes, counts, motions, operators, text objects, repeat, and the buffer list |
| `command.rs` | The `:` command line, regex search and substitute |
| `lsp.rs` | Language server client: JSON-RPC framing, one reader thread per server |
| `ui.rs` | Draws the visible lines, gutter, popups, status line and prompt with `ratatui` |
| `main.rs` | Terminal setup and the event loop |

`editor.rs` and `command.rs` never touch the terminal, so they are unit-tested by feeding keys.

## Keys

**Moving.** A count such as `3w` or `12G` repeats any of these.

| Keys | Action |
|---|---|
| `h j k l`, arrows | Character and line |
| `w b e` | Words |
| `0 ^ $` | Line start, first non-blank, line end |
| `gg G`, `:N` | File start, file end, line N |
| `{ }` | Paragraphs |
| `%` | Matching bracket |
| `f t F T` + char, `; ,` | Find a character on the line, repeat the find |
| `Ctrl-d Ctrl-u`, `PgDn PgUp` | Half page, full page |

**Editing**

| Keys | Action |
|---|---|
| `i a I A o O` | Enter insert mode; `Esc` leaves it |
| `d c y > <` + motion | Delete, change, yank, indent, dedent |
| `dd cc yy >> <<` | The same on whole lines |
| `iw aw i( a( i[ i{ i< i" i' ` | Text objects, after an operator or in visual mode |
| `x X D C s S Y` | Character and line shortcuts |
| `r` + char, `~`, `J` | Replace character, toggle case, join lines |
| `p P` | Put after or before |
| `u`, `Ctrl-r` | Undo, redo |
| `.` | Repeat the last change |
| `v V` | Visual and visual-line selection; `o` swaps ends |

**Searching.** Patterns are regular expressions. A pattern with no capital letters ignores case.

| Keys | Action |
|---|---|
| `/text`, `?text`, `n N` | Search forward, backward, next, previous |
| `*` | Search for the word under the cursor |
| `:s/a/b/g`, `:%s/a/b/g` | Substitute on the line or in the file; `\1` and `&` work in the replacement |
| `:noh` | Hide match highlighting |

**Files and buffers**

| Keys | Action |
|---|---|
| `:w [file]`, `:wa` | Write this buffer, write all |
| `:q`, `:q!`, `:wq`, `:qa` | Quit; refuses while any buffer has unsaved changes unless `!` |
| `:e file` | Open a file in a new buffer |
| `:bn`, `:bp`, `:bd`, `:ls` | Next, previous, close, list buffers |

**Language server**

| Keys | Action |
|---|---|
| `gd`, `Ctrl-o` | Go to definition, jump back |
| `K` | Show hover information |
| `Ctrl-n` | Ask for completions; they also appear as you type |
| `Ctrl-n Ctrl-p`, `Tab` or `Enter`, `Esc` | Move in the completion list, accept, dismiss |

Diagnostics are underlined, colour the line number, and show their message on the bottom line when
the cursor is on that line.

## Languages

Highlighting is bundled for Rust, Python, JavaScript, TypeScript, JSON and C.

Language servers are not bundled. `xe` starts one if it finds it on `PATH`, and runs without
language features otherwise. Pass `--no-lsp` to never start one.

| Language | Server |
|---|---|
| Rust | `rust-analyzer` |
| Python | `pyright-langserver`, else `pylsp` |
| JavaScript, TypeScript | `typescript-language-server` |
| C | `clangd` |
| JSON | `vscode-json-language-server` |

## Not implemented

- Split windows, named registers, macros, marks
- Ranges on `:` commands other than `%` for `:s`
- LSP rename, references, code actions, formatting and snippets
- Grapheme clusters: the cursor moves by Unicode scalar value, so combining marks and
  multi-codepoint emoji are not treated as one character
- Non-UTF-8 files, which are refused instead of opened
