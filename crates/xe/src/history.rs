//! Undo and redo.
//!
//! Every edit to the buffer is recorded as a [`Change`]: "at this position,
//! this text was removed and this text was inserted". Changes are grouped into
//! [`Transaction`]s so that one undo step reverts one user action (a whole
//! insert-mode session, a `dd`, a paste) rather than one keystroke.

/// A single replacement. Positions are char indices into the rope.
#[derive(Debug, Clone)]
pub struct Change {
    pub pos: usize,
    pub removed: String,
    pub inserted: String,
}

/// A group of changes that are undone and redone together.
#[derive(Debug, Clone)]
pub struct Transaction {
    pub changes: Vec<Change>,
    /// Cursor position before the first change, restored on undo.
    pub before: usize,
    /// Cursor position after the last change, restored on redo.
    pub after: usize,
    id: u64,
}

#[derive(Default)]
pub struct History {
    undo: Vec<Transaction>,
    redo: Vec<Transaction>,
    open: Option<Transaction>,
    next_id: u64,
    /// Id of the transaction that was on top of the undo stack at the last
    /// save. Zero means "the state the file was opened in".
    saved: u64,
}

impl History {
    /// Start a transaction if none is open.
    pub fn begin(&mut self, cursor: usize) {
        if self.open.is_none() {
            self.next_id += 1;
            self.open = Some(Transaction {
                changes: Vec::new(),
                before: cursor,
                after: cursor,
                id: self.next_id,
            });
        }
    }

    pub fn record(&mut self, change: Change) {
        if self.open.is_none() {
            self.begin(change.pos);
        }
        if let Some(tx) = self.open.as_mut() {
            tx.changes.push(change);
        }
    }

    /// Close the open transaction. Empty transactions are dropped.
    pub fn commit(&mut self, cursor: usize) {
        if let Some(mut tx) = self.open.take() {
            if !tx.changes.is_empty() {
                tx.after = cursor;
                self.undo.push(tx);
                self.redo.clear();
            }
        }
    }

    pub fn pop_undo(&mut self) -> Option<Transaction> {
        let cursor = self.open.as_ref().map_or(0, |tx| tx.before);
        self.commit(cursor);
        self.undo.pop()
    }

    pub fn push_redo(&mut self, tx: Transaction) {
        self.redo.push(tx);
    }

    pub fn pop_redo(&mut self) -> Option<Transaction> {
        self.redo.pop()
    }

    pub fn push_undo(&mut self, tx: Transaction) {
        self.undo.push(tx);
    }

    fn current(&self) -> u64 {
        self.undo.last().map_or(0, |tx| tx.id)
    }

    pub fn mark_saved(&mut self) {
        self.saved = self.current();
    }

    pub fn modified(&self) -> bool {
        self.open.as_ref().is_some_and(|tx| !tx.changes.is_empty()) || self.current() != self.saved
    }
}
