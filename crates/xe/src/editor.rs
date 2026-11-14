//! Editor state and key handling.
//!
//! This module never touches the terminal: it turns key events into changes
//! to the buffer, cursor and mode, which is what makes it testable.
//!
//! The command language follows vi: a *motion* (`w`, `$`, `G`) moves the
//! cursor, and an *operator* (`d`, `c`, `y`) followed by a motion acts on the
//! text the motion would have moved over.

use std::ops::Range;
use std::path::{Path, PathBuf};

use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use unicode_width::UnicodeWidthChar;

use crate::buffer::Buffer;

pub const TAB_WIDTH: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Normal,
    Insert,
    Visual,
    VisualLine,
    Command,
    Search,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Op {
    Delete,
    Change,
    Yank,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Motion {
    Left,
    Right,
    Up,
    Down,
    WordFwd,
    WordBack,
    WordEnd,
    LineStart,
    FirstNonBlank,
    LineEnd,
    FileStart,
    FileEnd,
    HalfPageDown,
    HalfPageUp,
    PageDown,
    PageUp,
}

impl Motion {
    fn from_key(code: KeyCode, ctrl: bool) -> Option<Self> {
        Some(match code {
            KeyCode::Left => Self::Left,
            KeyCode::Right => Self::Right,
            KeyCode::Up => Self::Up,
            KeyCode::Down => Self::Down,
            KeyCode::Home => Self::LineStart,
            KeyCode::End => Self::LineEnd,
            KeyCode::PageDown => Self::PageDown,
            KeyCode::PageUp => Self::PageUp,
            KeyCode::Char(c) if ctrl => match c {
                'd' => Self::HalfPageDown,
                'u' => Self::HalfPageUp,
                'f' => Self::PageDown,
                'b' => Self::PageUp,
                _ => return None,
            },
            KeyCode::Char(c) => match c {
                'h' => Self::Left,
                'l' => Self::Right,
                'k' => Self::Up,
                'j' => Self::Down,
                'w' => Self::WordFwd,
                'b' => Self::WordBack,
                'e' => Self::WordEnd,
                '0' => Self::LineStart,
                '^' => Self::FirstNonBlank,
                '$' => Self::LineEnd,
                'G' => Self::FileEnd,
                _ => return None,
            },
            _ => return None,
        })
    }

    /// Linewise motions make an operator act on whole lines.
    fn linewise(self) -> bool {
        use Motion::*;
        matches!(
            self,
            Up | Down | FileStart | FileEnd | HalfPageDown | HalfPageUp | PageDown | PageUp
        )
    }
}

pub struct Editor {
    pub buf: Buffer,
    /// Cursor position as a char index into the buffer.
    pub cursor: usize,
    /// Column the cursor returns to when moving vertically through shorter lines.
    want_col: usize,
    pub mode: Mode,
    /// First visible line and first visible display column.
    pub top: usize,
    pub left: usize,
    /// Height of the text area, set by the renderer; used for page motions.
    pub page: usize,
    /// Text being typed after `:` or `/`.
    pub cmdline: String,
    pub message: String,
    pub quit: bool,
    op: Option<Op>,
    g_pending: bool,
    /// Where visual mode was started.
    anchor: usize,
    register: String,
    register_linewise: bool,
    last_search: Option<String>,
}

impl Editor {
    pub fn new(buf: Buffer) -> Self {
        Self {
            buf,
            cursor: 0,
            want_col: 0,
            mode: Mode::Normal,
            top: 0,
            left: 0,
            page: 24,
            cmdline: String::new(),
            message: String::new(),
            quit: false,
            op: None,
            g_pending: false,
            anchor: 0,
            register: String::new(),
            register_linewise: false,
            last_search: None,
        }
    }

    pub fn open(path: Option<&Path>) -> std::io::Result<Self> {
        Ok(Self::new(match path {
            Some(p) => Buffer::open(p)?,
            None => Buffer::empty(),
        }))
    }

    pub fn handle_key(&mut self, key: KeyEvent) {
        self.message.clear();
        self.buf.begin(self.cursor);
        match self.mode {
            Mode::Insert => self.insert_key(key),
            Mode::Command | Mode::Search => self.prompt_key(key),
            Mode::Normal | Mode::Visual | Mode::VisualLine => self.normal_key(key),
        }
        self.cursor = self.cursor.min(self.buf.len());
        // An insert session stays one undo step until Esc; everything else is
        // one step per key.
        if self.mode != Mode::Insert {
            self.buf.commit(self.cursor);
        }
    }

    /// Text pasted through the terminal (bracketed paste).
    pub fn paste(&mut self, text: &str) {
        let text = text.replace("\r\n", "\n").replace('\r', "\n");
        match self.mode {
            Mode::Insert => {
                let text = text.replace('\n', self.buf.eol());
                self.buf.insert(self.cursor, &text);
                self.cursor += text.chars().count();
            }
            Mode::Command | Mode::Search => {
                self.cmdline.push_str(text.lines().next().unwrap_or(""))
            }
            _ => {}
        }
    }

    // ----- geometry ------------------------------------------------------

    pub fn line(&self) -> usize {
        self.buf.line_of(self.cursor)
    }

    fn last_line(&self) -> usize {
        self.buf.line_count() - 1
    }

    fn first_non_blank(&self, line: usize) -> usize {
        let end = self.buf.line_end(line);
        let mut p = self.buf.line_start(line);
        while p < end && matches!(self.buf.char_at(p), Some(' ' | '\t')) {
            p += 1;
        }
        p
    }

    /// Keep `pos` on a valid cursor cell of its line. Outside insert mode the
    /// cursor sits *on* a character, so it cannot go past the last one.
    fn clamp(&self, pos: usize) -> usize {
        let line = self.buf.line_of(pos);
        let (start, end) = (self.buf.line_start(line), self.buf.line_end(line));
        let max = if self.mode == Mode::Insert || end == start {
            end
        } else {
            end - 1
        };
        pos.clamp(start, max)
    }

    fn vertical(&self, line: usize) -> usize {
        let start = self.buf.line_start(line);
        let len = self.buf.line_end(line) - start;
        self.clamp(start + self.want_col.min(len))
    }

    /// Display column of `pos` within its line, accounting for tabs and wide
    /// characters.
    pub fn display_col(&self, pos: usize) -> usize {
        let start = self.buf.line_start(self.buf.line_of(pos));
        let mut col = 0;
        for c in self.buf.rope().slice(start..pos).chars() {
            col += char_width(c, col);
        }
        col
    }

    pub fn scroll_into_view(&mut self, height: usize, width: usize) {
        self.page = height.max(1);
        let margin = 3.min(height.saturating_sub(1) / 2);
        let line = self.line();
        if line < self.top + margin {
            self.top = line.saturating_sub(margin);
        } else if line + margin >= self.top + height {
            self.top = line + margin + 1 - height;
        }
        self.top = self.top.min(self.last_line());

        let col = self.display_col(self.cursor);
        if col < self.left {
            self.left = col;
        } else if col >= self.left + width {
            self.left = col + 1 - width;
        }
    }

    /// The selected char range in visual modes.
    pub fn selection(&self) -> Option<Range<usize>> {
        let (a, b) = (self.anchor.min(self.cursor), self.anchor.max(self.cursor));
        match self.mode {
            Mode::Visual => Some(a..(b + 1).min(self.buf.len())),
            Mode::VisualLine => {
                let (first, last) = (self.buf.line_of(a), self.buf.line_of(b));
                let end = if last < self.last_line() {
                    self.buf.line_start(last + 1)
                } else {
                    self.buf.len()
                };
                Some(self.buf.line_start(first)..end)
            }
            _ => None,
        }
    }

    // ----- motions -------------------------------------------------------

    fn class(&self, pos: usize) -> u8 {
        match self.buf.char_at(pos) {
            Some(c) if c.is_whitespace() => 0,
            Some(c) if c.is_alphanumeric() || c == '_' => 1,
            _ => 2,
        }
    }

    /// Start of the next word.
    fn word_fwd(&self, mut p: usize) -> usize {
        let n = self.buf.len();
        let class = self.class(p);
        if class != 0 {
            while p < n && self.class(p) == class {
                p += 1;
            }
        }
        while p < n && self.class(p) == 0 {
            p += 1;
        }
        p
    }

    /// Start of the current or previous word.
    fn word_back(&self, mut p: usize) -> usize {
        while p > 0 && self.class(p - 1) == 0 {
            p -= 1;
        }
        if p == 0 {
            return 0;
        }
        let class = self.class(p - 1);
        while p > 0 && self.class(p - 1) == class {
            p -= 1;
        }
        p
    }

    /// Last character of the current or next word.
    fn word_end(&self, mut p: usize) -> usize {
        let n = self.buf.len();
        p += 1;
        while p < n && self.class(p) == 0 {
            p += 1;
        }
        if p >= n {
            return n.saturating_sub(1);
        }
        let class = self.class(p);
        while p + 1 < n && self.class(p + 1) == class {
            p += 1;
        }
        p
    }

    /// Where a motion leads, before clamping to a valid cursor cell.
    fn target(&self, m: Motion) -> usize {
        let cur = self.cursor;
        let line = self.line();
        let last = self.last_line();
        let (start, end) = (self.buf.line_start(line), self.buf.line_end(line));
        match m {
            Motion::Left => cur.saturating_sub(1).max(start),
            Motion::Right => (cur + 1).min(end),
            Motion::LineStart => start,
            Motion::FirstNonBlank => self.first_non_blank(line),
            Motion::LineEnd => end,
            Motion::WordFwd => self.word_fwd(cur),
            Motion::WordBack => self.word_back(cur),
            Motion::WordEnd => self.word_end(cur),
            Motion::Up => self.vertical(line.saturating_sub(1)),
            Motion::Down => self.vertical((line + 1).min(last)),
            Motion::HalfPageUp => self.vertical(line.saturating_sub((self.page / 2).max(1))),
            Motion::HalfPageDown => self.vertical((line + (self.page / 2).max(1)).min(last)),
            Motion::PageUp => self.vertical(line.saturating_sub(self.page)),
            Motion::PageDown => self.vertical((line + self.page).min(last)),
            Motion::FileStart => self.first_non_blank(0),
            Motion::FileEnd => self.first_non_blank(last),
        }
    }

    fn move_by(&mut self, m: Motion) {
        self.cursor = self.clamp(self.target(m));
        if !matches!(
            m,
            Motion::Up
                | Motion::Down
                | Motion::HalfPageUp
                | Motion::HalfPageDown
                | Motion::PageUp
                | Motion::PageDown
        ) {
            self.remember_col();
        }
        if m == Motion::LineEnd {
            self.want_col = usize::MAX;
        }
    }

    fn remember_col(&mut self) {
        self.want_col = self.cursor - self.buf.line_start(self.line());
    }

    // ----- operators -----------------------------------------------------

    fn apply_op(&mut self, op: Op, m: Motion) {
        let cur = self.cursor;
        let line = self.line();
        if m.linewise() {
            let other = self.buf.line_of(self.target(m));
            self.op_lines(op, line.min(other), line.max(other));
            return;
        }
        let mut t = self.target(m);
        match m {
            // `cw` changes to the end of the word, leaving the space after it.
            Motion::WordFwd if op == Op::Change && self.class(cur) != 0 => {
                let class = self.class(cur);
                t = cur;
                while t < self.buf.len() && self.class(t) == class {
                    t += 1;
                }
            }
            // `dw` on the last word of a line stops at the end of that line.
            Motion::WordFwd if self.buf.line_of(t) > line => t = self.buf.line_end(line),
            // `e` lands on a character that is part of the range.
            Motion::WordEnd => t = (t + 1).min(self.buf.len()),
            _ => {}
        }
        let (start, end) = (cur.min(t), cur.max(t));
        if start < end {
            self.op_range(op, start, end);
        }
    }

    fn op_range(&mut self, op: Op, start: usize, end: usize) {
        self.register = self.buf.text(start..end);
        self.register_linewise = false;
        self.mode = Mode::Normal;
        match op {
            Op::Yank => self.cursor = start,
            Op::Delete => {
                self.buf.remove(start..end);
                self.cursor = self.clamp(start.min(self.buf.len()));
            }
            Op::Change => {
                self.buf.remove(start..end);
                self.cursor = start;
                self.mode = Mode::Insert;
            }
        }
        self.remember_col();
    }

    /// Apply an operator to the whole lines `first..=last`.
    fn op_lines(&mut self, op: Op, first: usize, last: usize) {
        let start = self.buf.line_start(first);
        let is_tail = last == self.last_line();
        let end = if is_tail {
            self.buf.len()
        } else {
            self.buf.line_start(last + 1)
        };
        self.register = self.buf.text(start..end);
        if is_tail {
            self.register.push_str(self.buf.eol());
        }
        self.register_linewise = true;
        self.mode = Mode::Normal;
        match op {
            Op::Yank => {
                if self.line() != first {
                    self.cursor = self.clamp(start);
                }
            }
            Op::Delete => {
                // Deleting the last lines also removes the line break before them.
                let from = if is_tail && first > 0 {
                    self.buf.line_end(first - 1)
                } else {
                    start
                };
                self.buf.remove(from..end);
                self.cursor = self.first_non_blank(first.min(self.last_line()));
                self.cursor = self.clamp(self.cursor);
            }
            Op::Change => {
                let indent = self.buf.text(start..self.first_non_blank(first));
                self.buf.replace(start..self.buf.line_end(last), &indent);
                self.cursor = start + indent.chars().count();
                self.mode = Mode::Insert;
            }
        }
        self.remember_col();
    }

    fn op_selection(&mut self, op: Op) {
        let (a, b) = (self.anchor.min(self.cursor), self.anchor.max(self.cursor));
        if self.mode == Mode::VisualLine {
            self.op_lines(op, self.buf.line_of(a), self.buf.line_of(b));
        } else if let Some(range) = self.selection() {
            self.op_range(op, range.start, range.end);
        }
    }

    fn put(&mut self, after: bool) {
        if self.register.is_empty() {
            return;
        }
        let text = self.register.clone();
        let line = self.line();
        if self.register_linewise {
            if !after {
                self.buf.insert(self.buf.line_start(line), &text);
                self.cursor = self.first_non_blank(line);
            } else if line < self.last_line() {
                self.buf.insert(self.buf.line_start(line + 1), &text);
                self.cursor = self.first_non_blank(line + 1);
            } else {
                // No line break after the last line: add one in front instead.
                let eol = self.buf.eol();
                let body = text.strip_suffix(eol).unwrap_or(&text);
                self.buf.insert(self.buf.len(), &format!("{eol}{body}"));
                self.cursor = self.first_non_blank(line + 1);
            }
        } else {
            let at = if after && self.cursor < self.buf.line_end(line) {
                self.cursor + 1
            } else {
                self.cursor
            };
            self.buf.insert(at, &text);
            self.cursor = self.clamp(at + text.chars().count() - 1);
        }
        self.remember_col();
    }

    // ----- normal and visual mode ------------------------------------------

    fn normal_key(&mut self, key: KeyEvent) {
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        let visual = matches!(self.mode, Mode::Visual | Mode::VisualLine);

        if key.code == KeyCode::Esc {
            self.op = None;
            self.g_pending = false;
            self.mode = Mode::Normal;
            return;
        }

        let motion = if self.g_pending {
            self.g_pending = false;
            if key.code != KeyCode::Char('g') {
                self.op = None;
                return;
            }
            Some(Motion::FileStart)
        } else if key.code == KeyCode::Char('g') && !ctrl {
            self.g_pending = true;
            return;
        } else {
            Motion::from_key(key.code, ctrl)
        };

        if let Some(m) = motion {
            match self.op.take() {
                Some(op) => self.apply_op(op, m),
                None => self.move_by(m),
            }
            return;
        }

        if let Some(op) = self.op.take() {
            // A doubled operator (`dd`, `yy`, `cc`) acts on the current line.
            let doubled = match op {
                Op::Delete => 'd',
                Op::Change => 'c',
                Op::Yank => 'y',
            };
            if key.code == KeyCode::Char(doubled) {
                let line = self.line();
                self.op_lines(op, line, line);
            }
            return;
        }

        if ctrl {
            if key.code == KeyCode::Char('r') {
                match self.buf.redo() {
                    Some(pos) => self.cursor = self.clamp(pos.min(self.buf.len())),
                    None => self.message = "Already at newest change".into(),
                }
            }
            return;
        }

        let KeyCode::Char(c) = key.code else { return };
        let line = self.line();
        match c {
            'd' | 'c' | 'y' | 'x' if visual => self.op_selection(match c {
                'c' => Op::Change,
                'y' => Op::Yank,
                _ => Op::Delete,
            }),
            'd' => self.op = Some(Op::Delete),
            'c' => self.op = Some(Op::Change),
            'y' => self.op = Some(Op::Yank),
            'v' | 'V' => {
                let wanted = if c == 'v' {
                    Mode::Visual
                } else {
                    Mode::VisualLine
                };
                if self.mode == wanted {
                    self.mode = Mode::Normal;
                } else {
                    if !visual {
                        self.anchor = self.cursor;
                    }
                    self.mode = wanted;
                }
            }
            'n' => self.search(true),
            'N' => self.search(false),
            _ if visual => {}
            'x' => self.apply_op(Op::Delete, Motion::Right),
            'D' => self.apply_op(Op::Delete, Motion::LineEnd),
            'C' => {
                // On an empty line there is nothing to remove, but `C` still
                // starts inserting.
                self.apply_op(Op::Change, Motion::LineEnd);
                self.mode = Mode::Insert;
            }
            'i' => self.mode = Mode::Insert,
            'a' => {
                self.cursor = (self.cursor + 1).min(self.buf.line_end(line));
                self.mode = Mode::Insert;
            }
            'I' => {
                self.cursor = self.first_non_blank(line);
                self.mode = Mode::Insert;
            }
            'A' => {
                self.cursor = self.buf.line_end(line);
                self.mode = Mode::Insert;
            }
            'o' => {
                self.cursor = self.buf.line_end(line);
                self.mode = Mode::Insert;
                self.newline();
            }
            'O' => {
                let indent = self
                    .buf
                    .text(self.buf.line_start(line)..self.first_non_blank(line));
                let start = self.buf.line_start(line);
                self.buf
                    .insert(start, &format!("{indent}{}", self.buf.eol()));
                self.cursor = start + indent.chars().count();
                self.mode = Mode::Insert;
            }
            'p' => self.put(true),
            'P' => self.put(false),
            'u' => match self.buf.undo() {
                Some(pos) => self.cursor = self.clamp(pos.min(self.buf.len())),
                None => self.message = "Already at oldest change".into(),
            },
            ':' => self.mode = Mode::Command,
            '/' => self.mode = Mode::Search,
            _ => {}
        }
    }

    // ----- insert mode -----------------------------------------------------

    /// Break the line at the cursor, copying the current line's indentation.
    fn newline(&mut self) {
        let line = self.line();
        let indent_end = self.first_non_blank(line).min(self.cursor);
        let indent = self.buf.text(self.buf.line_start(line)..indent_end);
        let text = format!("{}{indent}", self.buf.eol());
        self.buf.insert(self.cursor, &text);
        self.cursor += text.chars().count();
    }

    fn insert_key(&mut self, key: KeyEvent) {
        let line = self.line();
        match key.code {
            KeyCode::Esc => {
                self.mode = Mode::Normal;
                if self.cursor > self.buf.line_start(line) {
                    self.cursor -= 1;
                }
            }
            KeyCode::Enter => self.newline(),
            KeyCode::Backspace if self.cursor > 0 => {
                let mut from = self.cursor - 1;
                if self.buf.char_at(from) == Some('\n')
                    && from > 0
                    && self.buf.char_at(from - 1) == Some('\r')
                {
                    from -= 1;
                }
                self.buf.remove(from..self.cursor);
                self.cursor = from;
            }
            KeyCode::Delete if self.cursor < self.buf.len() => {
                let mut to = self.cursor + 1;
                if self.buf.char_at(self.cursor) == Some('\r') && self.buf.char_at(to) == Some('\n')
                {
                    to += 1;
                }
                self.buf.remove(self.cursor..to);
            }
            KeyCode::Tab => {
                let text = if self.buf.use_tabs {
                    "\t".to_string()
                } else {
                    " ".repeat(TAB_WIDTH - self.display_col(self.cursor) % TAB_WIDTH)
                };
                self.buf.insert(self.cursor, &text);
                self.cursor += text.chars().count();
            }
            KeyCode::Char(c)
                if !key
                    .modifiers
                    .intersects(KeyModifiers::CONTROL | KeyModifiers::ALT) =>
            {
                self.buf.insert(self.cursor, c.encode_utf8(&mut [0; 4]));
                self.cursor += 1;
            }
            code => {
                if let Some(
                    m @ (Motion::Left
                    | Motion::Right
                    | Motion::Up
                    | Motion::Down
                    | Motion::LineStart
                    | Motion::LineEnd
                    | Motion::PageUp
                    | Motion::PageDown),
                ) = Motion::from_key(code, false).filter(|_| !matches!(code, KeyCode::Char(_)))
                {
                    self.move_by(m);
                }
                return;
            }
        }
        self.remember_col();
    }

    // ----- command line and search -------------------------------------------

    fn prompt_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.cmdline.clear();
                self.mode = Mode::Normal;
            }
            KeyCode::Enter => {
                let text = std::mem::take(&mut self.cmdline);
                let was_search = self.mode == Mode::Search;
                self.mode = Mode::Normal;
                if was_search {
                    if !text.is_empty() {
                        self.last_search = Some(text);
                    }
                    self.search(true);
                } else {
                    self.execute(&text);
                }
            }
            KeyCode::Backspace => {
                if self.cmdline.pop().is_none() {
                    self.mode = Mode::Normal;
                }
            }
            KeyCode::Char(c) if !key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.cmdline.push(c)
            }
            _ => {}
        }
    }

    fn execute(&mut self, command: &str) {
        let command = command.trim();
        let (name, arg) = match command.split_once(char::is_whitespace) {
            Some((name, arg)) => (name, arg.trim()),
            None => (command, ""),
        };
        match name {
            "" => {}
            "w" => {
                self.write(arg);
            }
            "wq" | "x" => self.quit = self.write(arg),
            "q" if self.buf.modified() => {
                self.message = "No write since last change (add ! to override)".into()
            }
            "q" | "q!" => self.quit = true,
            _ => match name.parse::<usize>() {
                Ok(n) => {
                    let line = n.saturating_sub(1).min(self.last_line());
                    self.cursor = self.clamp(self.first_non_blank(line));
                    self.remember_col();
                }
                Err(_) => self.message = format!("Not an editor command: {name}"),
            },
        }
    }

    fn write(&mut self, arg: &str) -> bool {
        if !arg.is_empty() {
            self.buf.set_path(PathBuf::from(arg));
        }
        match self.buf.save() {
            Ok(bytes) => {
                let name = self
                    .buf
                    .path()
                    .map(|p| p.display().to_string())
                    .unwrap_or_default();
                self.message = format!("\"{name}\" {}L, {bytes}B written", self.buf.line_count());
                true
            }
            Err(e) => {
                self.message = format!("Cannot write: {e}");
                false
            }
        }
    }

    /// Jump to the next (or previous) occurrence of the last search pattern,
    /// wrapping around the buffer.
    fn search(&mut self, forward: bool) {
        let Some(pattern) = self.last_search.clone() else {
            self.message = "No previous search".into();
            return;
        };
        let lines = self.buf.line_count();
        let here = self.line();
        let col = self.cursor - self.buf.line_start(here);

        for step in 0..=lines {
            let line = if forward {
                (here + step) % lines
            } else {
                (here + lines - step % lines) % lines
            };
            let start = self.buf.line_start(line);
            let text = self.buf.text(start..self.buf.line_end(line));
            let mut cols = text
                .match_indices(&pattern)
                .map(|(byte, _)| text[..byte].chars().count());
            // The cursor's own line is visited twice: first for matches beyond
            // the cursor, and last (after wrapping) for the rest of it.
            let found = match (forward, step) {
                (true, 0) => cols.find(|&c| c > col),
                (true, s) if s == lines => cols.find(|&c| c <= col),
                (true, _) => cols.next(),
                (false, 0) => cols.filter(|&c| c < col).last(),
                (false, s) if s == lines => cols.filter(|&c| c >= col).last(),
                (false, _) => cols.last(),
            };
            if let Some(c) = found {
                let wrapped = if forward {
                    line < here || step == lines
                } else {
                    line > here || step == lines
                };
                if wrapped {
                    self.message = "Search wrapped".into();
                }
                self.cursor = start + c;
                self.remember_col();
                return;
            }
        }
        self.message = format!("Pattern not found: {pattern}");
    }
}

/// Width of `c` on screen when drawn at display column `col`.
pub fn char_width(c: char, col: usize) -> usize {
    match c {
        '\t' => TAB_WIDTH - col % TAB_WIDTH,
        c if c.is_control() => 1,
        c => c.width().unwrap_or(0),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub fn key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    /// Type a string. `\x1b` is Esc, `\n` is Enter, `\x7f` is Backspace and
    /// `\x12` is Ctrl-R.
    pub fn feed(ed: &mut Editor, keys: &str) {
        for c in keys.chars() {
            ed.handle_key(match c {
                '\x1b' => key(KeyCode::Esc),
                '\n' => key(KeyCode::Enter),
                '\x7f' => key(KeyCode::Backspace),
                '\t' => key(KeyCode::Tab),
                '\x12' => KeyEvent::new(KeyCode::Char('r'), KeyModifiers::CONTROL),
                c => key(KeyCode::Char(c)),
            });
        }
    }

    pub fn editor(text: &str) -> Editor {
        Editor::new(Buffer::from_text(text))
    }

    fn text(ed: &Editor) -> String {
        ed.buf.text(0..ed.buf.len())
    }

    /// Run `keys` on `before` and return the resulting text and cursor.
    fn run(before: &str, keys: &str) -> (String, usize) {
        let mut ed = editor(before);
        feed(&mut ed, keys);
        (text(&ed), ed.cursor)
    }

    #[test]
    fn insert_and_escape() {
        let mut ed = editor("");
        feed(&mut ed, "ihello\x1b");
        assert_eq!(text(&ed), "hello");
        assert_eq!((ed.mode, ed.cursor), (Mode::Normal, 4));
        feed(&mut ed, "a!\x1b");
        assert_eq!(text(&ed), "hello!");
    }

    #[test]
    fn word_motions() {
        let mut ed = editor("foo.bar  baz\nqux");
        feed(&mut ed, "w");
        assert_eq!(ed.cursor, 3);
        feed(&mut ed, "ww");
        assert_eq!(ed.cursor, 9);
        feed(&mut ed, "w");
        assert_eq!(ed.cursor, 13);
        feed(&mut ed, "b");
        assert_eq!(ed.cursor, 9);
        feed(&mut ed, "0e");
        assert_eq!(ed.cursor, 2);
        feed(&mut ed, "$");
        assert_eq!(ed.cursor, 11);
    }

    #[test]
    fn vertical_motion_remembers_column() {
        let mut ed = editor("long line\nab\nlong line");
        feed(&mut ed, "$j");
        assert_eq!(ed.cursor, 11);
        feed(&mut ed, "j");
        assert_eq!(ed.cursor, 21);
        feed(&mut ed, "gg");
        assert_eq!(ed.cursor, 0);
        feed(&mut ed, "G");
        assert_eq!(ed.line(), 2);
    }

    #[test]
    fn operators_with_motions() {
        assert_eq!(run("one two three", "dw"), ("two three".into(), 0));
        assert_eq!(run("one two three", "wde"), ("one  three".into(), 4));
        assert_eq!(run("one two three", "wD"), ("one ".into(), 3));
        assert_eq!(run("one two", "wd0"), ("two".into(), 0));
        assert_eq!(run("one two", "x"), ("ne two".into(), 0));
        // `dw` on the last word does not join the next line.
        assert_eq!(run("one\ntwo", "dw").0, "\ntwo");
        // `cw` keeps the following space.
        assert_eq!(run("one two", "cwuno\x1b").0, "uno two");
    }

    #[test]
    fn linewise_operators() {
        assert_eq!(run("a\nb\nc", "jdd"), ("a\nc".into(), 2));
        assert_eq!(run("a\nb\nc", "Gdd"), ("a\nb".into(), 2));
        assert_eq!(run("a", "dd"), ("".into(), 0));
        assert_eq!(run("a\nb\nc\nd", "djp").0, "c\na\nb\nd");
        assert_eq!(run("a\nb\nc", "dG").0, "");
        assert_eq!(run("a\nb\nc", "Gdgg").0, "");
        assert_eq!(run("  a\nb", "ccx\x1b").0, "  x\nb");
    }

    #[test]
    fn yank_and_put() {
        assert_eq!(run("a\nb", "yyp").0, "a\na\nb");
        assert_eq!(run("a\nb", "jyyp").0, "a\nb\nb");
        assert_eq!(run("a\nb", "jyyP").0, "a\nb\nb");
        assert_eq!(run("ab cd", "ywwP").0, "ab ab cd");
        assert_eq!(run("abc", "xp").0, "bac");
    }

    #[test]
    fn open_line_keeps_indentation() {
        assert_eq!(run("    a", "ob\x1b").0, "    a\n    b");
        assert_eq!(run("    a", "Ob\x1b").0, "    b\n    a");
        assert_eq!(run("  a", "A\nb\x1b").0, "  a\n  b");
    }

    #[test]
    fn undo_reverts_one_action_at_a_time() {
        let mut ed = editor("one");
        feed(&mut ed, "A two\x1b");
        feed(&mut ed, "A three\x1b");
        feed(&mut ed, "dd");
        assert_eq!(text(&ed), "");
        feed(&mut ed, "u");
        assert_eq!(text(&ed), "one two three");
        feed(&mut ed, "u");
        assert_eq!(text(&ed), "one two");
        feed(&mut ed, "uu");
        assert_eq!(text(&ed), "one");
        assert!(!ed.buf.modified());
        assert_eq!(ed.message, "Already at oldest change");
        feed(&mut ed, "\x12\x12");
        assert_eq!(text(&ed), "one two three");
    }

    #[test]
    fn visual_modes() {
        assert_eq!(run("one two three", "wvey$p").0, "one two threetwo");
        assert_eq!(run("one two three", "wved").0, "one  three");
        assert_eq!(run("a\nb\nc\nd", "jVjd").0, "a\nd");
        assert_eq!(run("one two", "vecx\x1b").0, "x two");
        let mut ed = editor("abc");
        feed(&mut ed, "vl");
        assert_eq!(ed.selection(), Some(0..2));
        feed(&mut ed, "\x1b");
        assert_eq!((ed.mode, ed.selection()), (Mode::Normal, None));
    }

    #[test]
    fn search_wraps_in_both_directions() {
        let mut ed = editor("foo bar\nbaz foo\nfoo");
        feed(&mut ed, "/foo\n");
        assert_eq!(ed.cursor, 12);
        feed(&mut ed, "n");
        assert_eq!(ed.cursor, 16);
        feed(&mut ed, "n");
        assert_eq!((ed.cursor, ed.message.as_str()), (0, "Search wrapped"));
        feed(&mut ed, "N");
        assert_eq!(ed.cursor, 16);
        feed(&mut ed, "N");
        assert_eq!(ed.cursor, 12);
        feed(&mut ed, "/nope\n");
        assert_eq!(
            (ed.cursor, ed.message.as_str()),
            (12, "Pattern not found: nope")
        );
    }

    #[test]
    fn search_finds_the_only_match_under_the_cursor_line() {
        let mut ed = editor("a foo");
        feed(&mut ed, "/foo\n");
        assert_eq!(ed.cursor, 2);
        feed(&mut ed, "n");
        assert_eq!(ed.cursor, 2);
    }

    #[test]
    fn commands_write_and_guard_quit() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.txt");
        let mut ed = editor("");
        feed(&mut ed, "ihi\x1b:q\n");
        assert!(!ed.quit);
        assert!(ed.message.starts_with("No write"));
        feed(&mut ed, ":w\n");
        assert_eq!(ed.message, "Cannot write: No file name");
        feed(&mut ed, &format!(":w {}\n", path.display()));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hi");
        feed(&mut ed, ":q\n");
        assert!(ed.quit);
    }

    #[test]
    fn goto_line_and_unknown_command() {
        let mut ed = editor("a\nb\nc");
        feed(&mut ed, ":2\n");
        assert_eq!(ed.line(), 1);
        feed(&mut ed, ":99\n");
        assert_eq!(ed.line(), 2);
        feed(&mut ed, ":bogus\n");
        assert_eq!(ed.message, "Not an editor command: bogus");
    }

    #[test]
    fn crlf_files_keep_their_line_endings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("crlf.txt");
        std::fs::write(&path, "a\r\nb\r\n").unwrap();
        let mut ed = Editor::open(Some(&path)).unwrap();
        feed(&mut ed, "ox\x1b");
        assert_eq!(ed.buf.text(0..ed.buf.len()), "a\r\nx\r\nb\r\n");
        // One backspace removes the whole two-character line ending.
        feed(&mut ed, "i\x7f\x1b");
        assert_eq!(ed.buf.text(0..ed.buf.len()), "ax\r\nb\r\n");
    }

    #[test]
    fn tab_and_paste() {
        assert_eq!(run("", "ia\tb\x1b").0, "a   b");
        let mut ed = editor("");
        feed(&mut ed, "i");
        ed.paste("x\r\n  y");
        feed(&mut ed, "\x1b");
        assert_eq!(text(&ed), "x\n  y");
        feed(&mut ed, "u");
        assert_eq!(text(&ed), "");
    }

    #[test]
    fn cursor_stays_on_a_character_in_normal_mode() {
        let mut ed = editor("ab\n\ncd");
        feed(&mut ed, "lll");
        assert_eq!(ed.cursor, 1);
        feed(&mut ed, "j");
        assert_eq!(ed.cursor, 3);
        feed(&mut ed, "j");
        assert_eq!(ed.cursor, 5);
    }
}
