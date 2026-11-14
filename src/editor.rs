//! Editor state and key handling.
//!
//! This module never touches the terminal: it turns key events into changes
//! to the buffer, cursor and mode, which is what makes it testable.
//!
//! The command language follows vi: a *motion* (`w`, `$`, `G`) moves the
//! cursor, and an *operator* (`d`, `c`, `y`) followed by a motion or a *text
//! object* (`iw`, `a(`) acts on the text it covers. A count multiplies either.

use std::ops::Range;
use std::path::{Path, PathBuf};

use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use regex::Regex;
use unicode_width::UnicodeWidthChar;

use crate::buffer::Buffer;
use crate::lsp::{CompletionItem, Lsp};

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
pub(crate) enum Op {
    Delete,
    Change,
    Yank,
    Indent,
    Dedent,
}

impl Op {
    fn key(self) -> char {
        match self {
            Op::Delete => 'd',
            Op::Change => 'c',
            Op::Yank => 'y',
            Op::Indent => '>',
            Op::Dedent => '<',
        }
    }
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
    ParaFwd,
    ParaBack,
    /// Jump to the bracket matching the next one on the line.
    Percent,
    /// `f`, `t`, `F`, `T`: `again` is set when repeated with `;` or `,`.
    Find {
        ch: char,
        forward: bool,
        till: bool,
        again: bool,
    },
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
                'l' | ' ' => Self::Right,
                'k' => Self::Up,
                'j' => Self::Down,
                'w' => Self::WordFwd,
                'b' => Self::WordBack,
                'e' => Self::WordEnd,
                '0' => Self::LineStart,
                '^' => Self::FirstNonBlank,
                '$' => Self::LineEnd,
                'G' => Self::FileEnd,
                '}' => Self::ParaFwd,
                '{' => Self::ParaBack,
                '%' => Self::Percent,
                _ => return None,
            },
            _ => return None,
        })
    }

    fn vertical(self) -> bool {
        use Motion::*;
        matches!(
            self,
            Up | Down | HalfPageDown | HalfPageUp | PageDown | PageUp
        )
    }

    /// Linewise motions make an operator act on whole lines.
    fn linewise(self) -> bool {
        self.vertical() || matches!(self, Motion::FileStart | Motion::FileEnd)
    }

    /// Inclusive motions land on a character that belongs to the operated range.
    fn inclusive(self) -> bool {
        matches!(
            self,
            Motion::WordEnd | Motion::Percent | Motion::Find { forward: true, .. }
        )
    }
}

/// A key that needs one more key to complete.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Pending {
    None,
    G,
    Find { forward: bool, till: bool },
    Replace,
    TextObject { around: bool },
}

/// A buffer that is open but not on screen, with its cursor and scroll state.
pub struct View {
    pub buf: Buffer,
    cursor: usize,
    want_col: usize,
    top: usize,
    left: usize,
}

/// The completion popup shown in insert mode.
pub struct Completion {
    items: Vec<CompletionItem>,
    pub selected: usize,
    /// Start of the word being completed.
    pub start: usize,
}

pub struct Editor {
    pub buf: Buffer,
    /// Cursor position as a char index into the buffer.
    pub cursor: usize,
    /// Column the cursor returns to when moving vertically through shorter lines.
    want_col: usize,
    /// First visible line and first visible display column.
    pub top: usize,
    pub left: usize,
    /// The other open buffers, in the order `:bn` visits them.
    pub(crate) others: Vec<View>,
    pub mode: Mode,
    /// Height of the text area, set by the renderer; used for page motions.
    pub page: usize,
    /// Text being typed after `:`, `/` or `?`.
    pub cmdline: String,
    pub message: String,
    /// Lines shown in a box at the cursor (hover text) until the next key.
    pub popup: Vec<String>,
    pub completion: Option<Completion>,
    pub quit: bool,
    pub lsp: Lsp,
    op: Option<Op>,
    pending: Pending,
    count: Option<usize>,
    /// Where visual mode was started.
    anchor: usize,
    register: String,
    register_linewise: bool,
    pub(crate) search: Option<Regex>,
    pub(crate) search_forward: bool,
    /// Whether matches of the search pattern are highlighted.
    pub highlight_search: bool,
    last_find: Option<(char, bool, bool)>,
    /// Places `gd` jumped from, for `Ctrl-o`.
    jumps: Vec<(Option<PathBuf>, usize)>,
    // `.` repeats the keys of the last command that changed the buffer.
    recording: Vec<KeyEvent>,
    last_change: Vec<KeyEvent>,
    revision_at_start: u64,
    pub(crate) skip_record: bool,
}

impl Editor {
    pub fn new(buf: Buffer) -> Self {
        Self {
            buf,
            cursor: 0,
            want_col: 0,
            top: 0,
            left: 0,
            others: Vec::new(),
            mode: Mode::Normal,
            page: 24,
            cmdline: String::new(),
            message: String::new(),
            popup: Vec::new(),
            completion: None,
            quit: false,
            lsp: Lsp::default(),
            op: None,
            pending: Pending::None,
            count: None,
            anchor: 0,
            register: String::new(),
            register_linewise: false,
            search: None,
            search_forward: true,
            highlight_search: false,
            last_find: None,
            jumps: Vec::new(),
            recording: Vec::new(),
            last_change: Vec::new(),
            revision_at_start: 0,
            skip_record: false,
        }
    }

    /// Open the given files; the first one is shown.
    pub fn open(paths: &[PathBuf]) -> std::io::Result<Self> {
        let mut buffers = paths
            .iter()
            .map(|p| Buffer::open(p))
            .collect::<Result<Vec<_>, _>>()?;
        if buffers.is_empty() {
            buffers.push(Buffer::empty());
        }
        let mut editor = Self::new(buffers.remove(0));
        editor.others = buffers
            .into_iter()
            .map(|buf| View {
                buf,
                cursor: 0,
                want_col: 0,
                top: 0,
                left: 0,
            })
            .collect();
        Ok(editor)
    }

    pub fn handle_key(&mut self, key: KeyEvent) {
        self.message.clear();
        self.popup.clear();
        if self.idle() {
            self.recording.clear();
            self.revision_at_start = self.buf.revision();
            self.skip_record = false;
        }
        self.recording.push(key);
        self.dispatch(key);
        if self.idle() && !self.skip_record && self.buf.revision() != self.revision_at_start {
            self.last_change = std::mem::take(&mut self.recording);
        }
    }

    /// True between commands: in normal mode with nothing half-typed.
    fn idle(&self) -> bool {
        self.mode == Mode::Normal
            && self.op.is_none()
            && self.pending == Pending::None
            && self.count.is_none()
    }

    fn dispatch(&mut self, key: KeyEvent) {
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
                self.buf.begin(self.cursor);
                let text = text.replace('\n', self.buf.eol());
                self.buf.insert(self.cursor, &text);
                self.cursor += text.chars().count();
                self.completion = None;
            }
            Mode::Command | Mode::Search => {
                self.cmdline.push_str(text.lines().next().unwrap_or(""))
            }
            _ => {}
        }
    }

    // ----- buffers -------------------------------------------------------

    fn stash(&mut self, buf: Buffer) -> View {
        self.buf.commit(self.cursor);
        self.mode = Mode::Normal;
        self.completion = None;
        self.skip_record = true;
        View {
            buf: std::mem::replace(&mut self.buf, buf),
            cursor: std::mem::take(&mut self.cursor),
            want_col: std::mem::take(&mut self.want_col),
            top: std::mem::take(&mut self.top),
            left: std::mem::take(&mut self.left),
        }
    }

    fn show(&mut self, view: View) -> View {
        let (cursor, want_col, top, left) = (view.cursor, view.want_col, view.top, view.left);
        let old = self.stash(view.buf);
        (self.cursor, self.want_col, self.top, self.left) = (cursor, want_col, top, left);
        old
    }

    pub(crate) fn next_buffer(&mut self, forward: bool) {
        if self.others.is_empty() {
            return;
        }
        if forward {
            let next = self.others.remove(0);
            let old = self.show(next);
            self.others.push(old);
        } else {
            let prev = self.others.pop().expect("checked non-empty");
            let old = self.show(prev);
            self.others.insert(0, old);
        }
    }

    /// Show the buffer for `path`, opening the file if it is not open yet.
    pub(crate) fn edit(&mut self, path: &Path) -> std::io::Result<()> {
        let wanted = absolute(path);
        if self.buf.path().map(absolute).as_ref() == Some(&wanted) {
            return Ok(());
        }
        if let Some(i) = self
            .others
            .iter()
            .position(|v| v.buf.path().map(absolute).as_ref() == Some(&wanted))
        {
            // Rotate so the ring order stays the same.
            for _ in 0..=i {
                self.next_buffer(true);
            }
            return Ok(());
        }
        let buf = Buffer::open(path)?;
        let old = self.stash(buf);
        self.others.push(old);
        Ok(())
    }

    /// Close the current buffer. Returns false if it was the only one.
    pub(crate) fn close_buffer(&mut self) -> bool {
        if self.others.is_empty() {
            return false;
        }
        let next = self.others.remove(0);
        self.show(next);
        true
    }

    // ----- geometry ------------------------------------------------------

    pub fn line(&self) -> usize {
        self.buf.line_of(self.cursor)
    }

    pub(crate) fn last_line(&self) -> usize {
        self.buf.line_count() - 1
    }

    pub(crate) fn first_non_blank(&self, line: usize) -> usize {
        let end = self.buf.line_end(line);
        let mut p = self.buf.line_start(line);
        while p < end && matches!(self.buf.char_at(p), Some(' ' | '\t')) {
            p += 1;
        }
        p
    }

    /// Keep `pos` on a valid cursor cell of its line. Outside insert mode the
    /// cursor sits *on* a character, so it cannot go past the last one.
    pub(crate) fn clamp(&self, pos: usize) -> usize {
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
        // The scroll margin never pushes the view past the end of the file.
        self.top = self.top.min((self.last_line() + 1).saturating_sub(height));

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
            Some(c) if is_word(c) => 1,
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

    fn blank(&self, line: usize) -> bool {
        self.first_non_blank(line) == self.buf.line_end(line)
    }

    /// The bracket matching the first bracket at or after the cursor on its line.
    fn matching_bracket(&self) -> Option<usize> {
        const PAIRS: [(char, char); 3] = [('(', ')'), ('[', ']'), ('{', '}')];
        let end = self.buf.line_end(self.line());
        let mut p = self.cursor;
        let (open, close, forward) = loop {
            if p >= end {
                return None;
            }
            let c = self.buf.char_at(p)?;
            if let Some(&(o, cl)) = PAIRS.iter().find(|(o, cl)| c == *o || c == *cl) {
                break (o, cl, c == o);
            }
            p += 1;
        };
        let mut depth = 0usize;
        loop {
            p = if forward { p + 1 } else { p.checked_sub(1)? };
            let c = self.buf.char_at(p)?;
            if c == if forward { open } else { close } {
                depth += 1;
            } else if c == if forward { close } else { open } {
                if depth == 0 {
                    return Some(p);
                }
                depth -= 1;
            }
        }
    }

    fn find_char(
        &self,
        ch: char,
        forward: bool,
        till: bool,
        again: bool,
        count: usize,
    ) -> Option<usize> {
        let line = self.line();
        let (start, end) = (self.buf.line_start(line), self.buf.line_end(line));
        // Repeating `t` must skip the character it stopped in front of.
        let skip = usize::from(till && again);
        let hit = |p: &usize| self.buf.char_at(*p) == Some(ch);
        if forward {
            let p = (self.cursor + 1 + skip..end).filter(hit).nth(count - 1)?;
            Some(if till { p - 1 } else { p })
        } else {
            let p = (start..self.cursor.saturating_sub(skip))
                .rev()
                .filter(hit)
                .nth(count - 1)?;
            Some(if till { p + 1 } else { p })
        }
    }

    /// Where one step of a motion leads, before clamping to a valid cursor cell.
    fn step(&self, m: Motion) -> Option<usize> {
        let cur = self.cursor;
        let line = self.line();
        let last = self.last_line();
        let (start, end) = (self.buf.line_start(line), self.buf.line_end(line));
        Some(match m {
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
            Motion::ParaFwd => {
                let mut l = line;
                while l < last && self.blank(l) {
                    l += 1;
                }
                while l < last && !self.blank(l) {
                    l += 1;
                }
                if self.blank(l) {
                    self.buf.line_start(l)
                } else {
                    self.buf.line_end(l)
                }
            }
            Motion::ParaBack => {
                let mut l = line;
                while l > 0 && self.blank(l) {
                    l -= 1;
                }
                while l > 0 && !self.blank(l) {
                    l -= 1;
                }
                self.buf.line_start(l)
            }
            Motion::Percent => self.matching_bracket()?,
            Motion::Find {
                ch,
                forward,
                till,
                again,
            } => self.find_char(ch, forward, till, again, 1)?,
        })
    }

    /// Where a motion leads when repeated `count` times.
    fn resolve(&mut self, m: Motion, count: Option<usize>) -> Option<usize> {
        match (m, count) {
            // `5G` and `5gg` go to line 5.
            (Motion::FileStart | Motion::FileEnd, Some(n)) => {
                Some(self.first_non_blank(n.saturating_sub(1).min(self.last_line())))
            }
            (
                Motion::Find {
                    ch,
                    forward,
                    till,
                    again,
                },
                Some(n),
            ) => self.find_char(ch, forward, till, again, n),
            _ => {
                let saved = self.cursor;
                let mut result = None;
                for _ in 0..count.unwrap_or(1) {
                    match self.step(m) {
                        Some(t) => {
                            result = Some(t);
                            self.cursor = t;
                        }
                        None => break,
                    }
                }
                self.cursor = saved;
                result
            }
        }
    }

    fn move_by(&mut self, m: Motion, count: Option<usize>) {
        let Some(target) = self.resolve(m, count) else {
            return;
        };
        self.cursor = self.clamp(target);
        if !m.vertical() {
            self.remember_col();
        }
        if m == Motion::LineEnd {
            self.want_col = usize::MAX;
        }
    }

    pub(crate) fn remember_col(&mut self) {
        self.want_col = self.cursor - self.buf.line_start(self.line());
    }

    // ----- text objects ----------------------------------------------------

    fn text_object(&self, c: char, around: bool) -> Option<Range<usize>> {
        match c {
            'w' => self.word_object(around),
            '(' | ')' | 'b' => self.pair_object('(', ')', around),
            '{' | '}' | 'B' => self.pair_object('{', '}', around),
            '[' | ']' => self.pair_object('[', ']', around),
            '<' | '>' => self.pair_object('<', '>', around),
            '"' | '\'' | '`' => self.quote_object(c, around),
            _ => None,
        }
    }

    fn word_object(&self, around: bool) -> Option<Range<usize>> {
        let line = self.line();
        let (ls, le) = (self.buf.line_start(line), self.buf.line_end(line));
        if ls == le {
            return None;
        }
        let cur = self.cursor.min(le - 1);
        let class = self.class(cur);
        let (mut s, mut e) = (cur, cur + 1);
        while s > ls && self.class(s - 1) == class {
            s -= 1;
        }
        while e < le && self.class(e) == class {
            e += 1;
        }
        if around {
            // Take the whitespace after the word, or before it if there is none.
            let next = self.class(e);
            let before = e;
            while e < le && self.class(e) == next && (class == 0 || next == 0) {
                e += 1;
            }
            if e == before && class != 0 {
                while s > ls && self.class(s - 1) == 0 {
                    s -= 1;
                }
            }
        }
        Some(s..e)
    }

    /// The bracket pair around the cursor, or failing that the next one
    /// that opens on the cursor's line.
    fn pair_object(&self, open: char, close: char, around: bool) -> Option<Range<usize>> {
        self.pair_from(self.cursor, open, close, around)
            .or_else(|| {
                let end = self.buf.line_end(self.line());
                let next = (self.cursor..end).find(|&p| self.buf.char_at(p) == Some(open))?;
                self.pair_from(next, open, close, around)
            })
    }

    fn pair_from(
        &self,
        from: usize,
        open: char,
        close: char,
        around: bool,
    ) -> Option<Range<usize>> {
        let at = |p| self.buf.char_at(p);
        let mut depth = 0usize;
        let mut s = from;
        loop {
            let c = at(s)?;
            if c == open {
                if depth == 0 {
                    break;
                }
                depth -= 1;
            } else if c == close && s != from {
                depth += 1;
            }
            s = s.checked_sub(1)?;
        }
        let mut e = s + 1;
        loop {
            let c = at(e)?;
            if c == open {
                depth += 1;
            } else if c == close {
                if depth == 0 {
                    break;
                }
                depth -= 1;
            }
            e += 1;
        }
        Some(if around { s..e + 1 } else { s + 1..e })
    }

    fn quote_object(&self, quote: char, around: bool) -> Option<Range<usize>> {
        let line = self.line();
        let (ls, le) = (self.buf.line_start(line), self.buf.line_end(line));
        let quotes: Vec<usize> = (ls..le)
            .filter(|&p| {
                self.buf.char_at(p) == Some(quote)
                    && (p == ls || self.buf.char_at(p - 1) != Some('\\'))
            })
            .collect();
        // The pair the cursor is inside, or the next one on the line.
        let pair = quotes.chunks_exact(2).find(|pair| self.cursor <= pair[1])?;
        Some(if around {
            pair[0]..pair[1] + 1
        } else {
            pair[0] + 1..pair[1]
        })
    }

    // ----- operators -----------------------------------------------------

    fn apply_op(&mut self, op: Op, m: Motion, count: Option<usize>) {
        let cur = self.cursor;
        let line = self.line();
        let Some(mut t) = self.resolve(m, count) else {
            return;
        };
        if m.linewise() {
            let other = self.buf.line_of(t);
            self.op_lines(op, line.min(other), line.max(other));
            return;
        }
        if m == Motion::WordFwd && op == Op::Change && self.class(cur) != 0 {
            // `cw` changes to the end of the word, leaving the space after it.
            // With a count, the word under the cursor is the first one.
            let class = self.class(cur);
            t = cur;
            while t < self.buf.len() && self.class(t) == class {
                t += 1;
            }
            for _ in 1..count.unwrap_or(1) {
                t = (self.word_end(t - 1) + 1).min(self.buf.len());
            }
        } else if m == Motion::WordFwd && count.is_none() && self.buf.line_of(t) > line {
            // `dw` on the last word of a line stops at the end of that line.
            t = self.buf.line_end(line);
        }
        let (start, mut end) = (cur.min(t), cur.max(t));
        if m.inclusive() {
            end = (end + 1).min(self.buf.len());
        }
        if start < end {
            self.op_range(op, start, end);
        }
    }

    fn op_range(&mut self, op: Op, start: usize, end: usize) {
        if matches!(op, Op::Indent | Op::Dedent) {
            let last = self.buf.line_of(end.saturating_sub(1).max(start));
            self.op_lines(op, self.buf.line_of(start), last);
            return;
        }
        self.register = self.buf.text(start..end);
        self.register_linewise = false;
        self.mode = Mode::Normal;
        match op {
            Op::Delete => {
                self.buf.remove(start..end);
                self.cursor = self.clamp(start.min(self.buf.len()));
            }
            Op::Change => {
                self.buf.remove(start..end);
                self.cursor = start;
                self.mode = Mode::Insert;
            }
            _ => self.cursor = start,
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
        if matches!(op, Op::Delete | Op::Change | Op::Yank) {
            self.register = self.buf.text(start..end);
            if is_tail {
                self.register.push_str(self.buf.eol());
            }
            self.register_linewise = true;
        }
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
            Op::Indent | Op::Dedent => {
                let unit = if self.buf.use_tabs {
                    "\t".to_string()
                } else {
                    " ".repeat(TAB_WIDTH)
                };
                for line in first..=last {
                    let ls = self.buf.line_start(line);
                    if op == Op::Indent {
                        if !self.blank(line) {
                            self.buf.insert(ls, &unit);
                        }
                    } else {
                        let lead = self.first_non_blank(line) - ls;
                        let n = if self.buf.char_at(ls) == Some('\t') {
                            1
                        } else {
                            lead.min(TAB_WIDTH)
                        };
                        self.buf.remove(ls..ls + n);
                    }
                }
                self.cursor = self.clamp(self.first_non_blank(first));
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

    fn put(&mut self, after: bool, count: usize) {
        if self.register.is_empty() {
            return;
        }
        let text = self.register.repeat(count);
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

    fn reset_pending(&mut self) {
        self.op = None;
        self.pending = Pending::None;
        self.count = None;
    }

    fn normal_key(&mut self, key: KeyEvent) {
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        let visual = matches!(self.mode, Mode::Visual | Mode::VisualLine);

        if key.code == KeyCode::Esc {
            self.reset_pending();
            self.mode = Mode::Normal;
            self.cursor = self.clamp(self.cursor);
            return;
        }

        let mut motion = None;
        match (
            std::mem::replace(&mut self.pending, Pending::None),
            key.code,
        ) {
            (Pending::None, KeyCode::Char(c)) if !ctrl => match c {
                '1'..='9' => {
                    let digit = c as usize - '0' as usize;
                    self.count = Some(
                        self.count
                            .unwrap_or(0)
                            .saturating_mul(10)
                            .saturating_add(digit)
                            .min(999_999),
                    );
                    return;
                }
                '0' if self.count.is_some() => {
                    self.count = self.count.map(|n| n.saturating_mul(10).min(999_999));
                    return;
                }
                'g' => {
                    self.pending = Pending::G;
                    return;
                }
                'f' | 'F' | 't' | 'T' => {
                    self.pending = Pending::Find {
                        forward: c.is_lowercase(),
                        till: matches!(c, 't' | 'T'),
                    };
                    return;
                }
                'i' | 'a' if self.op.is_some() || visual => {
                    self.pending = Pending::TextObject { around: c == 'a' };
                    return;
                }
                ';' | ',' => {
                    let Some((ch, forward, till)) = self.last_find else {
                        self.reset_pending();
                        return;
                    };
                    motion = Some(Motion::Find {
                        ch,
                        forward: forward == (c == ';'),
                        till,
                        again: true,
                    });
                }
                _ => {}
            },
            (Pending::None, _) => {}
            (Pending::G, KeyCode::Char('g')) => motion = Some(Motion::FileStart),
            (Pending::G, KeyCode::Char('d')) if self.op.is_none() => {
                self.reset_pending();
                self.goto_definition();
                return;
            }
            (Pending::Find { forward, till }, KeyCode::Char(ch)) => {
                self.last_find = Some((ch, forward, till));
                motion = Some(Motion::Find {
                    ch,
                    forward,
                    till,
                    again: false,
                });
            }
            (Pending::Replace, KeyCode::Char(ch)) => {
                let n = self.count.take().unwrap_or(1);
                if self.cursor + n <= self.buf.line_end(self.line()) {
                    self.buf
                        .replace(self.cursor..self.cursor + n, &ch.to_string().repeat(n));
                    self.cursor += n - 1;
                }
                return;
            }
            (Pending::TextObject { around }, KeyCode::Char(c)) => {
                let range = self.text_object(c, around);
                let op = self.op.take();
                self.count = None;
                match (range, op) {
                    (Some(r), None) if !r.is_empty() => {
                        self.anchor = r.start;
                        self.cursor = r.end - 1;
                    }
                    // An empty object such as `ci(` on `()` still starts inserting.
                    (Some(r), Some(op)) if !r.is_empty() || op == Op::Change => {
                        self.op_range(op, r.start, r.end)
                    }
                    _ => {}
                }
                return;
            }
            _ => {
                self.reset_pending();
                return;
            }
        }

        let motion = motion.or_else(|| Motion::from_key(key.code, ctrl));
        if let Some(m) = motion {
            let count = self.count.take();
            match self.op.take() {
                Some(op) => self.apply_op(op, m, count),
                None => self.move_by(m, count),
            }
            return;
        }

        let count = self.count.take();
        let n = count.unwrap_or(1);
        let line = self.line();

        if let Some(op) = self.op.take() {
            // A doubled operator (`dd`, `yy`, `>>`) acts on whole lines.
            if key.code == KeyCode::Char(op.key()) {
                self.op_lines(op, line, (line + n - 1).min(self.last_line()));
            }
            return;
        }

        if ctrl {
            match key.code {
                KeyCode::Char('r') => {
                    self.skip_record = true;
                    match self.buf.redo() {
                        Some(pos) => self.cursor = self.clamp(pos.min(self.buf.len())),
                        None => self.message = "Already at newest change".into(),
                    }
                }
                KeyCode::Char('o') => self.jump_back(),
                _ => {}
            }
            return;
        }

        let KeyCode::Char(c) = key.code else { return };
        match c {
            'd' | 'c' | 'y' | 'x' | '>' | '<' if visual => self.op_selection(match c {
                'c' => Op::Change,
                'y' => Op::Yank,
                '>' => Op::Indent,
                '<' => Op::Dedent,
                _ => Op::Delete,
            }),
            'd' | 'c' | 'y' | '>' | '<' => {
                self.op = [Op::Delete, Op::Change, Op::Yank, Op::Indent, Op::Dedent]
                    .into_iter()
                    .find(|o| o.key() == c);
                self.count = count;
            }
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
            'n' | 'N' => {
                for _ in 0..n {
                    self.search_next((c == 'n') == self.search_forward);
                }
            }
            '*' => self.search_word(),
            'o' if visual => std::mem::swap(&mut self.anchor, &mut self.cursor),
            _ if visual => {}
            'x' => self.apply_op(Op::Delete, Motion::Right, count),
            'X' => self.apply_op(Op::Delete, Motion::Left, count),
            'D' => self.apply_op(Op::Delete, Motion::LineEnd, None),
            'Y' => self.op_lines(Op::Yank, line, (line + n - 1).min(self.last_line())),
            'S' => self.op_lines(Op::Change, line, (line + n - 1).min(self.last_line())),
            'C' | 's' => {
                // With nothing to remove these still start inserting.
                let m = if c == 'C' {
                    Motion::LineEnd
                } else {
                    Motion::Right
                };
                self.apply_op(Op::Change, m, count);
                self.mode = Mode::Insert;
            }
            'r' => {
                self.pending = Pending::Replace;
                self.count = count;
            }
            '~' => {
                let end = (self.cursor + n).min(self.buf.line_end(line));
                let flipped: String = self
                    .buf
                    .text(self.cursor..end)
                    .chars()
                    .map(flip_case)
                    .collect();
                self.buf.replace(self.cursor..end, &flipped);
                self.cursor = self.clamp(end);
            }
            'J' => {
                for _ in 0..n.saturating_sub(1).max(1) {
                    let line = self.line();
                    if line == self.last_line() {
                        break;
                    }
                    let end = self.buf.line_end(line);
                    let next = self.first_non_blank(line + 1);
                    let gap = if end > self.buf.line_start(line) && !self.blank(line + 1) {
                        " "
                    } else {
                        ""
                    };
                    self.buf.replace(end..next, gap);
                    self.cursor = self.clamp(end);
                }
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
            'p' => self.put(true, n),
            'P' => self.put(false, n),
            'u' => {
                self.skip_record = true;
                match self.buf.undo() {
                    Some(pos) => self.cursor = self.clamp(pos.min(self.buf.len())),
                    None => self.message = "Already at oldest change".into(),
                }
            }
            '.' => {
                self.skip_record = true;
                for key in self.last_change.clone() {
                    self.dispatch(key);
                }
            }
            'K' => self.hover(),
            ':' => self.mode = Mode::Command,
            '/' | '?' => {
                self.search_forward = c == '/';
                self.mode = Mode::Search;
            }
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
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        if self.completion_key(key, ctrl) {
            return;
        }
        let line = self.line();
        let mut typed = None;
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
            KeyCode::Char('n' | ' ') if ctrl => {
                self.recording.pop();
                self.request_completion();
                return;
            }
            KeyCode::Char(c)
                if !key
                    .modifiers
                    .intersects(KeyModifiers::CONTROL | KeyModifiers::ALT) =>
            {
                self.buf.insert(self.cursor, c.encode_utf8(&mut [0; 4]));
                self.cursor += 1;
                typed = Some(c);
            }
            code => {
                if !matches!(code, KeyCode::Char(_)) {
                    if let Some(m) = Motion::from_key(code, false) {
                        self.move_by(m, None);
                    }
                }
                self.completion = None;
                return;
            }
        }
        self.remember_col();

        // Keep the popup while the word is still being typed; otherwise ask
        // the language server again once a new word or member access starts.
        match (&self.completion, typed) {
            (Some(c), _)
                if self.cursor < c.start
                    || !typed.is_some_and(is_word) && key.code != KeyCode::Backspace =>
            {
                self.completion = None;
            }
            (Some(_), _) => {
                if self.completion_items().is_empty() {
                    self.completion = None;
                }
            }
            (None, Some(c)) if is_word(c) || c == '.' || c == ':' => self.request_completion(),
            _ => {}
        }
    }

    /// Handle a key for the completion popup. Returns true if it was consumed.
    fn completion_key(&mut self, key: KeyEvent, ctrl: bool) -> bool {
        let count = self.completion_items().len();
        let Some(completion) = self.completion.as_mut() else {
            return false;
        };
        if count == 0 {
            self.completion = None;
            return false;
        }
        match key.code {
            KeyCode::Down => completion.selected = (completion.selected + 1) % count,
            KeyCode::Char('n') if ctrl => completion.selected = (completion.selected + 1) % count,
            KeyCode::Up => completion.selected = (completion.selected + count - 1) % count,
            KeyCode::Char('p') if ctrl => {
                completion.selected = (completion.selected + count - 1) % count
            }
            KeyCode::Esc => self.completion = None,
            KeyCode::Tab | KeyCode::Enter => {
                let start = completion.start;
                let selected = completion.selected.min(count - 1);
                let insert = self.completion_items()[selected].insert.clone();
                let typed = self.buf.text(start..self.cursor);
                self.buf.replace(start..self.cursor, &insert);
                self.cursor = start + insert.chars().count();
                self.completion = None;
                self.remember_col();
                // Record what was inserted, not the popup keys, so `.` repeats it.
                self.recording.pop();
                match insert.strip_prefix(typed.as_str()) {
                    Some(rest) => self.recording.extend(
                        rest.chars()
                            .map(|c| KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)),
                    ),
                    None => self.skip_record = true,
                }
                return true;
            }
            _ => return false,
        }
        self.recording.pop();
        true
    }

    /// The popup's items that match what has been typed so far.
    pub fn completion_items(&self) -> Vec<&CompletionItem> {
        let Some(c) = &self.completion else {
            return Vec::new();
        };
        let typed = self
            .buf
            .text(c.start..self.cursor.max(c.start))
            .to_lowercase();
        c.items
            .iter()
            .filter(|item| item.label.to_lowercase().starts_with(&typed))
            .collect()
    }

    // ----- language server -------------------------------------------------

    /// Send the buffer's current text to its language server if it changed.
    fn lsp_sync(&mut self) {
        if let (Some(language), Some(path)) = (self.buf.language(), self.buf.path()) {
            let rope = self.buf.rope();
            self.lsp
                .sync(language, path, self.buf.revision(), || rope.to_string());
        }
    }

    fn lsp_request(&mut self, method: &str) -> bool {
        self.lsp_sync();
        let (line, col) = self.char_to_lsp(self.cursor);
        match (self.buf.language(), self.buf.path()) {
            (Some(language), Some(path)) => {
                self.lsp
                    .request(language, path, method, line, col, self.buf.revision())
            }
            _ => false,
        }
    }

    fn goto_definition(&mut self) {
        if !self.lsp_request("textDocument/definition") {
            self.message = "No language server for this buffer".into();
        }
    }

    fn hover(&mut self) {
        if !self.lsp_request("textDocument/hover") {
            self.message = "No language server for this buffer".into();
        }
    }

    fn request_completion(&mut self) {
        self.lsp_request("textDocument/completion");
    }

    fn jump_back(&mut self) {
        let Some((path, pos)) = self.jumps.pop() else {
            self.message = "No earlier jump".into();
            return;
        };
        if let Some(path) = path {
            if let Err(e) = self.edit(&path) {
                self.message = format!("{}: {e}", path.display());
                return;
            }
        }
        self.cursor = self.clamp(pos.min(self.buf.len()));
        self.remember_col();
    }

    /// Process language server messages. Called between key presses; returns
    /// true if the screen needs redrawing.
    pub fn tick(&mut self) -> bool {
        self.lsp_sync();
        let events = self.lsp.poll();
        let changed = !events.is_empty();
        for event in events {
            self.on_lsp_event(event);
        }
        changed
    }

    pub(crate) fn on_lsp_event(&mut self, event: crate::lsp::Event) {
        use crate::lsp::Event;
        match event {
            Event::Redraw => {}
            Event::Status(text) => self.message = text,
            Event::Hover(text) => {
                self.popup = text.lines().map(str::to_string).collect();
                if self.popup.is_empty() {
                    self.message = "No information".into();
                }
            }
            Event::Definition(None) => self.message = "No definition found".into(),
            Event::Definition(Some((path, line, col))) => {
                let origin = (self.buf.path().map(Path::to_path_buf), self.cursor);
                if let Err(e) = self.edit(&path) {
                    self.message = format!("{}: {e}", path.display());
                    return;
                }
                self.jumps.push(origin);
                self.cursor = self.clamp(self.lsp_to_char(line, col));
                self.remember_col();
            }
            Event::Completion { revision, items } => {
                if self.mode == Mode::Insert && revision == self.buf.revision() && !items.is_empty()
                {
                    let mut start = self.cursor;
                    while start > 0 && self.buf.char_at(start - 1).is_some_and(is_word) {
                        start -= 1;
                    }
                    self.completion = Some(Completion {
                        items,
                        selected: 0,
                        start,
                    });
                    if self.completion_items().is_empty() {
                        self.completion = None;
                    }
                }
            }
        }
    }

    /// Convert a char index to an LSP position (line, UTF-16 column).
    fn char_to_lsp(&self, pos: usize) -> (usize, usize) {
        let rope = self.buf.rope();
        let line = self.buf.line_of(pos);
        (
            line,
            rope.char_to_utf16_cu(pos) - rope.char_to_utf16_cu(self.buf.line_start(line)),
        )
    }

    /// Convert an LSP position to a char index, clamped to the buffer.
    pub fn lsp_to_char(&self, line: usize, col: usize) -> usize {
        let rope = self.buf.rope();
        let line = line.min(self.last_line());
        let start = self.buf.line_start(line);
        let unit = (rope.char_to_utf16_cu(start) + col).min(rope.len_utf16_cu());
        rope.utf16_cu_to_char(unit).min(self.buf.line_end(line))
    }
}

pub fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

pub(crate) fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn flip_case(c: char) -> char {
    let mut flipped = if c.is_lowercase() {
        c.to_uppercase().collect::<Vec<_>>()
    } else {
        c.to_lowercase().collect()
    };
    // Characters whose other case is more than one char are left alone.
    if flipped.len() == 1 {
        flipped.remove(0)
    } else {
        c
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
#[path = "editor_tests.rs"]
pub(crate) mod tests;
