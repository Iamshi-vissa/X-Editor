//! xe: a small modal terminal text editor.

mod buffer;
mod command;
mod editor;
mod history;
mod lsp;
mod syntax;
mod ui;

use std::io::{self, stdout};
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use ratatui::crossterm::cursor::SetCursorStyle;
use ratatui::crossterm::event::{
    self, DisableBracketedPaste, EnableBracketedPaste, Event, KeyEventKind,
};
use ratatui::crossterm::execute;
use ratatui::DefaultTerminal;

use editor::{Editor, Mode};

const HELP: &str = "\
xe - a small modal terminal text editor

Usage: xe [--no-lsp] [FILE]...

Moving (a count such as 3w or 12G repeats any of these)
  h j k l, arrows     character and line      w b e          words
  0 ^ $               line start and end      gg G           file start and end
  { }                 paragraphs              %              matching bracket
  f t F T + char      find on the line        ; ,            repeat the find
  Ctrl-d Ctrl-u       half page               PgUp PgDn      full page

Editing
  i a I A o O         insert                  Esc            back to normal mode
  d c y > < + motion  delete, change, yank, indent, dedent   dd cc yy >> <<  lines
  iw aw i( a( i\" a\"   text objects after an operator or in visual mode
  x X D C s S r ~ J   character and line shortcuts
  p P                 put                     u Ctrl-r       undo and redo
  .                   repeat the last change  v V            visual modes

Searching (patterns are regular expressions)
  /text ?text n N     search                  *              word under cursor
  :s/a/b/g  :%s/a/b/g substitute              :noh           hide matches

Files and buffers
  :w [file]  :wa      write                   :q :q! :wq :qa quit
  :e file             open                    :bn :bp :bd :ls  buffers
  :N                  go to line N

Language server (rust-analyzer, pyright, typescript-language-server, clangd)
  gd                  go to definition        Ctrl-o         jump back
  K                   hover                   Ctrl-n         complete
";

fn main() -> ExitCode {
    let mut paths = Vec::new();
    let mut lsp = true;
    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "-h" | "--help" => {
                print!("{HELP}");
                return ExitCode::SUCCESS;
            }
            "-V" | "--version" => {
                println!("xe {}", env!("CARGO_PKG_VERSION"));
                return ExitCode::SUCCESS;
            }
            "--no-lsp" => lsp = false,
            _ => paths.push(PathBuf::from(arg)),
        }
    }

    // Open the files before touching the terminal so errors print normally.
    let mut editor = match Editor::open(&paths) {
        Ok(editor) => editor,
        Err(e) => {
            eprintln!("xe: {e}");
            return ExitCode::FAILURE;
        }
    };
    if lsp {
        editor.lsp.enable();
    }

    // `init` switches to the alternate screen and raw mode, and installs a
    // panic hook that restores the terminal.
    let mut terminal = ratatui::init();
    let _ = execute!(stdout(), EnableBracketedPaste);
    let result = run(&mut terminal, &mut editor);
    let _ = execute!(
        stdout(),
        DisableBracketedPaste,
        SetCursorStyle::DefaultUserShape
    );
    ratatui::restore();

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("xe: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(terminal: &mut DefaultTerminal, editor: &mut Editor) -> io::Result<()> {
    let mut shape = None;
    let mut redraw = true;
    while !editor.quit {
        if redraw {
            terminal.draw(|frame| ui::draw(frame, editor))?;
            let wanted = editor.mode == Mode::Insert;
            if shape != Some(wanted) {
                let style = if wanted {
                    SetCursorStyle::SteadyBar
                } else {
                    SetCursorStyle::SteadyBlock
                };
                execute!(stdout(), style)?;
                shape = Some(wanted);
            }
        }

        // Wake up regularly to pick up language server messages.
        redraw = false;
        if event::poll(Duration::from_millis(50))? {
            redraw = true;
            match event::read()? {
                Event::Key(key) if key.kind != KeyEventKind::Release => editor.handle_key(key),
                Event::Paste(text) => editor.paste(&text),
                _ => {}
            }
        }
        redraw |= editor.tick();
    }
    Ok(())
}
