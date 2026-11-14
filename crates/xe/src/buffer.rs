//! The text buffer: a rope plus everything that must stay in sync with it
//! (undo history, the syntax tree, the file on disk).
//!
//! All positions are char indices. Only `\n` ends a line, which matches how
//! tree-sitter counts rows; a `\r` before it is kept as part of the line
//! ending so CRLF files round-trip unchanged.

use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Write};
use std::ops::Range;
use std::path::{Path, PathBuf};

use ropey::Rope;
use tree_sitter::{InputEdit, Point};

use crate::history::{Change, History};
use crate::syntax::{Span, Syntax};

pub struct Buffer {
    rope: Rope,
    path: Option<PathBuf>,
    history: History,
    syntax: Option<Syntax>,
    eol: &'static str,
    pub use_tabs: bool,
    /// Incremented on every change to the text, including undo and redo.
    revision: u64,
}

impl Buffer {
    pub fn empty() -> Self {
        Self::from_text("")
    }

    /// Open `path`. A path that does not exist yet gives an empty buffer that
    /// will be created on first save. Files that are not UTF-8 are refused
    /// rather than opened lossily, because saving them would corrupt them.
    pub fn open(path: &Path) -> io::Result<Self> {
        let rope = match File::open(path) {
            Ok(file) => Rope::from_reader(BufReader::new(file))?,
            Err(e) if e.kind() == io::ErrorKind::NotFound => Rope::new(),
            Err(e) => return Err(e),
        };
        Ok(Self::from_rope(rope, Some(path.to_path_buf())))
    }

    pub fn from_text(text: &str) -> Self {
        Self::from_rope(Rope::from_str(text), None)
    }

    fn from_rope(rope: Rope, path: Option<PathBuf>) -> Self {
        let head = rope.lines().take(200);
        let mut eol = "\n";
        let mut use_tabs = false;
        for (i, line) in head.enumerate() {
            let n = line.len_chars();
            if i == 0 && n >= 2 && line.char(n - 2) == '\r' {
                eol = "\r\n";
            }
            if n > 0 && line.char(0) == '\t' {
                use_tabs = true;
            }
        }
        let syntax = path.as_deref().and_then(Syntax::for_path);
        Self {
            rope,
            path,
            history: History::default(),
            syntax,
            eol,
            use_tabs,
            revision: 0,
        }
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn rope(&self) -> &Rope {
        &self.rope
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    pub fn set_path(&mut self, path: PathBuf) {
        self.syntax = Syntax::for_path(&path);
        self.path = Some(path);
    }

    pub fn language(&self) -> Option<&'static str> {
        self.syntax.as_ref().map(|s| s.name)
    }

    /// The line ending this file uses, for newly inserted lines.
    pub fn eol(&self) -> &'static str {
        self.eol
    }

    pub fn len(&self) -> usize {
        self.rope.len_chars()
    }

    /// Number of lines. A trailing newline is followed by one empty line, as
    /// in most non-vi editors, so there is always at least one line.
    pub fn line_count(&self) -> usize {
        self.rope.len_lines()
    }

    pub fn line_of(&self, pos: usize) -> usize {
        self.rope.char_to_line(pos.min(self.len()))
    }

    pub fn line_start(&self, line: usize) -> usize {
        self.rope.line_to_char(line)
    }

    /// End of the line's content, before its line ending.
    pub fn line_end(&self, line: usize) -> usize {
        let slice = self.rope.line(line);
        let mut n = slice.len_chars();
        if n > 0 && slice.char(n - 1) == '\n' {
            n -= 1;
            if n > 0 && slice.char(n - 1) == '\r' {
                n -= 1;
            }
        }
        self.line_start(line) + n
    }

    pub fn char_at(&self, pos: usize) -> Option<char> {
        (pos < self.len()).then(|| self.rope.char(pos))
    }

    pub fn text(&self, range: Range<usize>) -> String {
        self.rope.slice(range).to_string()
    }

    // ----- editing -------------------------------------------------------

    /// Replace `range` with `text`, recording the change for undo.
    pub fn replace(&mut self, range: Range<usize>, text: &str) {
        if range.is_empty() && text.is_empty() {
            return;
        }
        let removed = self.text(range.clone());
        self.apply(range.start, range.len(), text);
        self.history.record(Change {
            pos: range.start,
            removed,
            inserted: text.to_string(),
        });
    }

    pub fn insert(&mut self, pos: usize, text: &str) {
        self.replace(pos..pos, text);
    }

    pub fn remove(&mut self, range: Range<usize>) {
        self.replace(range, "");
    }

    /// The one place the rope is mutated. It also tells the syntax tree what
    /// moved, so the next parse can reuse every unchanged subtree.
    fn apply(&mut self, pos: usize, remove_chars: usize, insert: &str) {
        let start_byte = self.rope.char_to_byte(pos);
        let old_end_byte = self.rope.char_to_byte(pos + remove_chars);
        let start_position = self.point(start_byte);
        let old_end_position = self.point(old_end_byte);

        self.rope.remove(pos..pos + remove_chars);
        self.rope.insert(pos, insert);
        self.revision += 1;

        if let Some(syntax) = self.syntax.as_mut() {
            let new_end_byte = start_byte + insert.len();
            let row = self.rope.byte_to_line(new_end_byte);
            let new_end_position = Point::new(row, new_end_byte - self.rope.line_to_byte(row));
            syntax.edit(&InputEdit {
                start_byte,
                old_end_byte,
                new_end_byte,
                start_position,
                old_end_position,
                new_end_position,
            });
        }
    }

    fn point(&self, byte: usize) -> Point {
        let row = self.rope.byte_to_line(byte);
        Point::new(row, byte - self.rope.line_to_byte(row))
    }

    // ----- undo ----------------------------------------------------------

    pub fn begin(&mut self, cursor: usize) {
        self.history.begin(cursor);
    }

    pub fn commit(&mut self, cursor: usize) {
        self.history.commit(cursor);
    }

    /// Undo one transaction. Returns where the cursor should go.
    pub fn undo(&mut self) -> Option<usize> {
        let tx = self.history.pop_undo()?;
        for c in tx.changes.iter().rev() {
            self.apply(c.pos, c.inserted.chars().count(), &c.removed);
        }
        let cursor = tx.before;
        self.history.push_redo(tx);
        Some(cursor)
    }

    pub fn redo(&mut self) -> Option<usize> {
        let tx = self.history.pop_redo()?;
        for c in &tx.changes {
            self.apply(c.pos, c.removed.chars().count(), &c.inserted);
        }
        let cursor = tx.after;
        self.history.push_undo(tx);
        Some(cursor)
    }

    pub fn modified(&self) -> bool {
        self.history.modified()
    }

    // ----- files ---------------------------------------------------------

    /// Write the buffer to its path atomically: the content goes to a
    /// temporary file in the same directory, is flushed to disk, and is then
    /// renamed over the target. A crash mid-save leaves the old file intact.
    pub fn save(&mut self) -> io::Result<usize> {
        let path = self
            .path
            .clone()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "No file name"))?;
        // Write through symlinks instead of replacing the link itself.
        let target = fs::canonicalize(&path).unwrap_or(path);
        let dir = match target.parent() {
            Some(d) if !d.as_os_str().is_empty() => d.to_path_buf(),
            _ => PathBuf::from("."),
        };
        let name = target.file_name().unwrap_or_default().to_string_lossy();
        let tmp = dir.join(format!(".{name}.xe-{}.tmp", std::process::id()));

        let written = (|| {
            let mut out = BufWriter::new(File::create(&tmp)?);
            self.rope.write_to(&mut out)?;
            out.flush()?;
            out.get_ref().sync_all()?;
            if let Ok(meta) = fs::metadata(&target) {
                fs::set_permissions(&tmp, meta.permissions())?;
            }
            fs::rename(&tmp, &target)
        })();
        if let Err(e) = written {
            let _ = fs::remove_file(&tmp);
            return Err(e);
        }
        self.history.mark_saved();
        Ok(self.rope.len_bytes())
    }

    // ----- syntax --------------------------------------------------------

    /// Highlight spans overlapping `bytes`, ordered so that painting them in
    /// sequence gives the right result.
    pub fn highlights(&mut self, bytes: Range<usize>) -> Vec<Span> {
        match self.syntax.as_mut() {
            Some(syntax) => syntax.highlights(&self.rope, bytes),
            None => Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn buf(text: &str) -> Buffer {
        Buffer::from_text(text)
    }

    #[test]
    fn line_geometry() {
        let b = buf("ab\r\ncd\n");
        assert_eq!(b.line_count(), 3);
        assert_eq!((b.line_start(0), b.line_end(0)), (0, 2));
        assert_eq!((b.line_start(1), b.line_end(1)), (4, 6));
        assert_eq!((b.line_start(2), b.line_end(2)), (7, 7));
        assert_eq!(b.eol(), "\r\n");
        assert_eq!(buf("").line_count(), 1);
    }

    #[test]
    fn undo_redo_groups_changes() {
        let mut b = buf("hello");
        b.begin(0);
        b.insert(5, " world");
        b.remove(0..1);
        b.commit(4);
        assert_eq!(b.text(0..b.len()), "ello world");
        assert!(b.modified());

        assert_eq!(b.undo(), Some(0));
        assert_eq!(b.text(0..b.len()), "hello");
        assert!(!b.modified());

        assert_eq!(b.redo(), Some(4));
        assert_eq!(b.text(0..b.len()), "ello world");
        assert_eq!(b.redo(), None);
    }

    #[test]
    fn new_edit_discards_redo() {
        let mut b = buf("a");
        b.begin(0);
        b.insert(1, "b");
        b.commit(1);
        b.undo();
        b.begin(0);
        b.insert(1, "c");
        b.commit(1);
        assert_eq!(b.redo(), None);
        assert_eq!(b.text(0..b.len()), "ac");
    }

    #[test]
    fn save_is_atomic_and_tracks_modified() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.txt");
        fs::write(&path, "one\n").unwrap();

        let mut b = Buffer::open(&path).unwrap();
        b.begin(0);
        b.insert(0, "zero\n");
        b.commit(0);
        assert!(b.modified());
        b.save().unwrap();
        assert!(!b.modified());
        assert_eq!(fs::read_to_string(&path).unwrap(), "zero\none\n");

        // Undoing past the save point makes the buffer modified again.
        b.undo();
        assert!(b.modified());

        // No temporary file is left behind.
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn missing_file_opens_empty_and_invalid_utf8_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let b = Buffer::open(&dir.path().join("new.rs")).unwrap();
        assert_eq!(b.len(), 0);
        assert_eq!(b.language(), Some("rust"));

        let bad = dir.path().join("bad.bin");
        fs::write(&bad, [0xff, 0xfe, 0x00]).unwrap();
        assert!(Buffer::open(&bad).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn save_writes_through_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real.txt");
        let link = dir.path().join("link.txt");
        fs::write(&real, "x").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let mut b = Buffer::open(&link).unwrap();
        b.begin(0);
        b.insert(1, "y");
        b.commit(2);
        b.save().unwrap();
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_to_string(&real).unwrap(), "xy");
    }
}
