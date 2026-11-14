//! The `:` command line and searching.

use std::path::PathBuf;

use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use regex::{NoExpand, Regex, RegexBuilder};

use crate::editor::{is_word, Editor, Mode};

impl Editor {
    pub(crate) fn prompt_key(&mut self, key: KeyEvent) {
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
                    if text.is_empty() || self.set_search(&text, None) {
                        self.search_next(self.search_forward);
                    }
                } else {
                    // Ex commands are not repeated by `.`.
                    self.skip_record = true;
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
        for (prefix, whole_file) in [("%s", true), ("s", false)] {
            if let Some(rest) = command.strip_prefix(prefix) {
                if rest.starts_with(|c: char| !c.is_alphanumeric() && !c.is_whitespace()) {
                    self.substitute(rest, whole_file);
                    return;
                }
            }
        }
        let (name, arg) = match command.split_once(char::is_whitespace) {
            Some((name, arg)) => (name, arg.trim()),
            None => (command, ""),
        };
        let unsaved = self.others.iter().any(|v| v.buf.modified());
        match name {
            "" => {}
            "w" => {
                self.write(arg);
            }
            "wq" | "x" => {
                if self.write(arg) {
                    self.quit_checked(unsaved);
                }
            }
            "wa" => {
                self.write_all();
            }
            "wqa" | "xa" => self.quit = self.write_all(),
            "q" => self.quit_checked(self.buf.modified() || unsaved),
            "qa" => self.quit_checked(self.buf.modified() || unsaved),
            "q!" | "qa!" => self.quit = true,
            "e" | "edit" if arg.is_empty() => self.message = "No file name".into(),
            "e" | "edit" => {
                if let Err(e) = self.edit(&PathBuf::from(arg)) {
                    self.message = format!("{arg}: {e}");
                }
            }
            "bn" | "bnext" => self.next_buffer(true),
            "bp" | "bprevious" => self.next_buffer(false),
            "bd" if self.buf.modified() => {
                self.message = "No write since last change (add ! to override)".into()
            }
            "bd" | "bd!" => {
                if !self.close_buffer() {
                    self.message = "Cannot close the last buffer".into();
                }
            }
            "ls" | "buffers" => {
                let name = |b: &crate::buffer::Buffer| {
                    let path = b
                        .path()
                        .map_or("[No Name]".to_string(), |p| p.display().to_string());
                    format!("{path}{}", if b.modified() { " [+]" } else { "" })
                };
                let mut names = vec![format!("> {}", name(&self.buf))];
                names.extend(self.others.iter().map(|v| name(&v.buf)));
                self.message = names.join("  |  ");
            }
            "noh" | "nohlsearch" => self.highlight_search = false,
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

    fn quit_checked(&mut self, unsaved: bool) {
        if unsaved {
            self.message = "No write since last change (add ! to override)".into();
        } else {
            self.quit = true;
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
                if let (Some(language), Some(path)) = (self.buf.language(), self.buf.path()) {
                    let rope = self.buf.rope();
                    self.lsp
                        .sync(language, path, self.buf.revision(), || rope.to_string());
                    self.lsp.saved(language, path);
                }
                true
            }
            Err(e) => {
                self.message = format!("Cannot write: {e}");
                false
            }
        }
    }

    /// Write every modified buffer that has a file name.
    fn write_all(&mut self) -> bool {
        let mut ok = !self.buf.modified() || self.write("");
        let mut failed = None;
        for view in self.others.iter_mut().filter(|v| v.buf.modified()) {
            if let Err(e) = view.buf.save() {
                let name = view
                    .buf
                    .path()
                    .map_or("[No Name]".to_string(), |p| p.display().to_string());
                failed = Some(format!("Cannot write {name}: {e}"));
            }
        }
        if let Some(message) = failed {
            self.message = message;
            ok = false;
        }
        ok
    }

    // ----- search --------------------------------------------------------

    /// Compile and remember a search pattern. Like vim's `smartcase`, a
    /// pattern without capitals matches any case unless told otherwise.
    fn set_search(&mut self, pattern: &str, ignore_case: Option<bool>) -> bool {
        let ignore_case = ignore_case.unwrap_or_else(|| !pattern.chars().any(char::is_uppercase));
        match RegexBuilder::new(pattern)
            .case_insensitive(ignore_case)
            .build()
        {
            Ok(regex) => {
                self.search = Some(regex);
                self.highlight_search = true;
                true
            }
            Err(_) => {
                self.message = format!("Invalid pattern: {pattern}");
                false
            }
        }
    }

    /// Search for the word under the cursor (`*`).
    pub(crate) fn search_word(&mut self) {
        let end = self.buf.line_end(self.line());
        let (mut s, mut e) = (self.cursor, self.cursor);
        while e < end && self.buf.char_at(e).is_some_and(is_word) {
            e += 1;
        }
        while s > 0 && self.buf.char_at(s - 1).is_some_and(is_word) {
            s -= 1;
        }
        if s == e {
            self.message = "No word under cursor".into();
            return;
        }
        let word = regex::escape(&self.buf.text(s..e));
        self.search_forward = true;
        if self.set_search(&format!(r"\b{word}\b"), Some(false)) {
            self.search_next(true);
        }
    }

    /// Jump to the next (or previous) match of the search pattern, wrapping
    /// around the buffer.
    pub(crate) fn search_next(&mut self, forward: bool) {
        let Some(regex) = self.search.clone() else {
            self.message = "No previous search".into();
            return;
        };
        self.highlight_search = true;
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
            let mut cols = regex
                .find_iter(&text)
                .map(|m| text[..m.start()].chars().count());
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
                self.cursor = self.clamp(start + c);
                self.remember_col();
                return;
            }
        }
        self.message = format!("Pattern not found: {}", regex.as_str());
    }

    /// `:s/pattern/replacement/flags` on the current line, or the whole file
    /// for `:%s`. Flags: `g` replaces every match on a line, `i` ignores case.
    fn substitute(&mut self, spec: &str, whole_file: bool) {
        let mut chars = spec.chars();
        let delimiter = chars.next().expect("caller checked the delimiter");
        // Split on the delimiter, honouring backslash escapes.
        let mut parts = vec![String::new()];
        let mut escaped = false;
        for c in chars {
            let splittable = parts.len() < 3;
            let last = parts.last_mut().expect("starts non-empty");
            if escaped {
                if c != delimiter {
                    last.push('\\');
                }
                last.push(c);
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == delimiter && splittable {
                parts.push(String::new());
            } else {
                last.push(c);
            }
        }
        let flags = parts.get(2).cloned().unwrap_or_default();
        let ignore_case = flags.contains('i').then_some(true);
        if !parts[0].is_empty() && !self.set_search(&parts[0], ignore_case) {
            return;
        }
        let Some(regex) = self.search.clone() else {
            self.message = "No previous search".into();
            return;
        };
        let replacement = vim_replacement(parts.get(1).map_or("", String::as_str));

        let (first, last) = if whole_file {
            (0, self.last_line())
        } else {
            (self.line(), self.line())
        };
        let (mut count, mut changed_lines, mut last_changed) = (0, 0, None);
        for line in first..=last {
            let range = self.buf.line_start(line)..self.buf.line_end(line);
            let text = self.buf.text(range.clone());
            let matches = regex.find_iter(&text).count();
            if matches == 0 {
                continue;
            }
            let limit = if flags.contains('g') { 0 } else { 1 };
            let new = match &replacement {
                Ok(expanding) => regex.replacen(&text, limit, expanding.as_str()),
                Err(literal) => regex.replacen(&text, limit, NoExpand(literal)),
            };
            count += if limit == 0 { matches } else { 1 };
            changed_lines += 1;
            last_changed = Some(line);
            self.buf.replace(range, &new);
        }
        match last_changed {
            Some(line) => {
                self.cursor = self.clamp(self.first_non_blank(line));
                self.remember_col();
                self.message = format!("{count} substitution(s) on {changed_lines} line(s)");
            }
            None => self.message = format!("Pattern not found: {}", regex.as_str()),
        }
    }
}

/// Translate a vim replacement string (`\1`, `&`) to the regex crate's syntax
/// (`${1}`, `${0}`). Returns `Err` with the literal text if nothing expands.
fn vim_replacement(text: &str) -> Result<String, String> {
    let mut out = String::new();
    let mut expands = false;
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => match chars.next() {
                Some(d @ '0'..='9') => {
                    out.push_str(&format!("${{{d}}}"));
                    expands = true;
                }
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some(other) => out.push(other),
                None => out.push('\\'),
            },
            '&' => {
                out.push_str("${0}");
                expands = true;
            }
            '$' => out.push_str("$$"),
            c => out.push(c),
        }
    }
    if expands {
        Ok(out)
    } else {
        Err(out.replace("$$", "$"))
    }
}

/// The compiled pattern, for highlighting matches on screen.
impl Editor {
    pub fn search_pattern(&self) -> Option<&Regex> {
        self.search.as_ref().filter(|_| self.highlight_search)
    }
}
