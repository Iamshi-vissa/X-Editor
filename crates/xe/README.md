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
| `editor.rs` | Modes, motions and operators; no terminal access, so it is unit-tested directly |
| `ui.rs` | Draws the visible lines, gutter, status line and prompt with `ratatui` |
| `main.rs` | Terminal setup and the event loop |

## Keys

| Keys | Action |
|---|---|
| `h j k l`, arrows | Move |
| `w b e` | Word motions |
| `0 ^ $` | Line start, first non-blank, line end |
| `gg G`, `:N` | File start, file end, line N |
| `Ctrl-d Ctrl-u`, `PgDn PgUp` | Half page, full page |
| `i a I A o O` | Enter insert mode; `Esc` leaves it |
| `d c y` + motion, `dd cc yy` | Delete, change, yank |
| `x D C` | Delete character, delete or change to end of line |
| `p P` | Put after or before |
| `u`, `Ctrl-r` | Undo, redo |
| `v V` | Visual and visual-line selection |
| `/text`, `n N` | Search forward, next, previous |
| `:w [file]`, `:q`, `:q!`, `:wq` | Write, quit |

Highlighting is bundled for Rust, Python, JavaScript, TypeScript, JSON and C.

## Not implemented yet

- Counts (`3dd`), repeat (`.`), text objects (`diw`) and named registers
- Multiple buffers or splits
- Regex search and search-match highlighting
- Grapheme clusters: the cursor moves by Unicode scalar value, so combining
  marks and multi-codepoint emoji are not treated as one character
- Non-UTF-8 files, which are refused instead of opened
- LSP
