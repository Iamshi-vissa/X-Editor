//! xe: a small modal terminal text editor.

mod buffer;
mod editor;
mod history;
mod syntax;
mod ui;

use std::io::{self, stdout};
use std::path::PathBuf;
use std::process::ExitCode;

use ratatui::crossterm::cursor::SetCursorStyle;
use ratatui::crossterm::event::{
    self, DisableBracketedPaste, EnableBracketedPaste, Event, KeyEventKind,
};
use ratatui::crossterm::execute;
use ratatui::DefaultTerminal;

use editor::{Editor, Mode};

const HELP: &str = "\
xe - a small modal terminal text editor

Usage: xe [FILE]

Keys (normal mode):
  h j k l, arrows     move                w b e        word motions
  0 ^ $               line start / end    gg G         file start / end
  Ctrl-d Ctrl-u       half page           PgUp PgDn    full page
  i a I A o O         insert              Esc          back to normal mode
  d c y + motion      delete/change/yank  dd cc yy     whole line
  x D C               delete char / to end of line
  p P                 put                 u Ctrl-r     undo / redo
  v V                 visual / visual line
  /text  n N          search              :N           go to line N
  :w [file]  :q  :q!  :wq                 write / quit
";

fn main() -> ExitCode {
    let mut path = None;
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
            _ if path.is_none() => path = Some(PathBuf::from(arg)),
            _ => {
                eprintln!("xe: only one file can be opened at a time");
                return ExitCode::FAILURE;
            }
        }
    }

    // Open the file before touching the terminal so errors print normally.
    let mut editor = match Editor::open(path.as_deref()) {
        Ok(editor) => editor,
        Err(e) => {
            let name = path.map(|p| p.display().to_string()).unwrap_or_default();
            eprintln!("xe: {name}: {e}");
            return ExitCode::FAILURE;
        }
    };

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
    while !editor.quit {
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

        match event::read()? {
            Event::Key(key) if key.kind != KeyEventKind::Release => editor.handle_key(key),
            Event::Paste(text) => {
                editor.buf.begin(editor.cursor);
                editor.paste(&text);
            }
            _ => {}
        }
    }
    Ok(())
}
