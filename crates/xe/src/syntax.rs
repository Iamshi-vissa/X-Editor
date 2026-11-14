//! Syntax highlighting with tree-sitter.
//!
//! The buffer reports every edit through [`Syntax::edit`], which shifts the
//! positions in the existing tree. The next [`Syntax::highlights`] call
//! reparses, and tree-sitter reuses every subtree the edit did not touch, so
//! the cost depends on the size of the change, not the size of the file.

use std::ops::Range;
use std::path::Path;

use ratatui::style::{Color, Modifier, Style};
use ropey::Rope;
use tree_sitter::{InputEdit, Language, Node, Parser, Query, QueryCursor, StreamingIterator, Tree};

/// A highlighted byte range.
#[derive(Debug, Clone, Copy)]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub style: Style,
    pattern: usize,
}

pub struct Syntax {
    pub name: &'static str,
    parser: Parser,
    tree: Option<Tree>,
    query: Query,
    /// Style for each capture index in `query`; `None` for captures the theme
    /// leaves alone.
    styles: Vec<Option<Style>>,
    dirty: bool,
}

impl Syntax {
    pub fn for_path(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?;
        let js = tree_sitter_javascript::HIGHLIGHT_QUERY;
        let ts = tree_sitter_typescript::HIGHLIGHTS_QUERY;
        let (name, language, query): (_, Language, String) = match ext {
            "rs" => (
                "rust",
                tree_sitter_rust::LANGUAGE.into(),
                tree_sitter_rust::HIGHLIGHTS_QUERY.into(),
            ),
            "py" | "pyi" => (
                "python",
                tree_sitter_python::LANGUAGE.into(),
                tree_sitter_python::HIGHLIGHTS_QUERY.into(),
            ),
            "js" | "mjs" | "cjs" | "jsx" => (
                "javascript",
                tree_sitter_javascript::LANGUAGE.into(),
                format!("{js}\n{}", tree_sitter_javascript::JSX_HIGHLIGHT_QUERY),
            ),
            // The TypeScript query only covers what TypeScript adds to JavaScript.
            "ts" | "mts" | "cts" => (
                "typescript",
                tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
                format!("{js}\n{ts}"),
            ),
            "tsx" => (
                "tsx",
                tree_sitter_typescript::LANGUAGE_TSX.into(),
                format!("{js}\n{ts}"),
            ),
            "json" => (
                "json",
                tree_sitter_json::LANGUAGE.into(),
                tree_sitter_json::HIGHLIGHTS_QUERY.into(),
            ),
            "c" | "h" => (
                "c",
                tree_sitter_c::LANGUAGE.into(),
                tree_sitter_c::HIGHLIGHT_QUERY.into(),
            ),
            _ => return None,
        };
        let mut parser = Parser::new();
        parser.set_language(&language).ok()?;
        let query = Query::new(&language, &query).ok()?;
        let styles = query.capture_names().iter().map(|n| style_for(n)).collect();
        Some(Self {
            name,
            parser,
            tree: None,
            query,
            styles,
            dirty: true,
        })
    }

    pub fn edit(&mut self, edit: &InputEdit) {
        if let Some(tree) = self.tree.as_mut() {
            tree.edit(edit);
        }
        self.dirty = true;
    }

    fn parse(&mut self, rope: &Rope) {
        if !self.dirty {
            return;
        }
        let len = rope.len_bytes();
        // Feed the rope to the parser chunk by chunk, without copying it into
        // one contiguous string.
        let mut read = |byte: usize, _| {
            if byte >= len {
                return "";
            }
            let (chunk, chunk_start, _, _) = rope.chunk_at_byte(byte);
            &chunk[byte - chunk_start..]
        };
        self.tree = self
            .parser
            .parse_with_options(&mut read, self.tree.as_ref(), None);
        self.dirty = false;
    }

    pub fn highlights(&mut self, rope: &Rope, bytes: Range<usize>) -> Vec<Span> {
        self.parse(rope);
        let Some(tree) = self.tree.as_ref() else {
            return Vec::new();
        };

        let mut cursor = QueryCursor::new();
        cursor.set_byte_range(bytes);
        let text = |node: Node| {
            rope.byte_slice(node.byte_range())
                .chunks()
                .map(str::as_bytes)
        };
        let mut captures = cursor.captures(&self.query, tree.root_node(), text);

        let mut spans = Vec::new();
        while let Some((m, index)) = captures.next() {
            let capture = m.captures[*index];
            if let Some(style) = self.styles[capture.index as usize] {
                spans.push(Span {
                    start: capture.node.start_byte(),
                    end: capture.node.end_byte(),
                    style,
                    pattern: m.pattern_index,
                });
            }
        }
        // Paint order: enclosing nodes first so nested nodes show on top, and
        // for the same node, later (more specific) patterns win.
        spans.sort_by_key(|s| (std::cmp::Reverse(s.end - s.start), s.pattern));
        spans
    }
}

/// Map a capture name such as `function.method` to a style, falling back to
/// its parents (`function`). Uses the terminal's own 16 colours so the result
/// follows the user's colour scheme.
fn style_for(name: &str) -> Option<Style> {
    let mut name = name;
    loop {
        let fg = |c| Some(Style::new().fg(c));
        let style = match name {
            "comment" => Some(
                Style::new()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::ITALIC),
            ),
            "keyword" => fg(Color::Magenta),
            "string" => fg(Color::Green),
            "string.special" | "escape" => fg(Color::Cyan),
            "number" | "constant" | "constant.builtin" => fg(Color::LightRed),
            "function" => fg(Color::Blue),
            "function.macro" => fg(Color::LightBlue),
            "type" | "constructor" => fg(Color::Yellow),
            "attribute" | "label" | "tag" => fg(Color::LightYellow),
            "property" => fg(Color::Cyan),
            "variable.builtin" => fg(Color::Red),
            "variable.parameter" => Some(Style::new().add_modifier(Modifier::ITALIC)),
            "operator" | "punctuation" => fg(Color::Gray),
            _ => None,
        };
        if style.is_some() {
            return style;
        }
        name = &name[..name.rfind('.')?];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn style_of(syntax: &mut Syntax, src: &str, word: &str) -> Option<Style> {
        let rope = Rope::from_str(src);
        let at = src.find(word).unwrap();
        syntax
            .highlights(&rope, 0..src.len())
            .into_iter()
            .rfind(|s| s.start <= at && at + word.len() <= s.end)
            .map(|s| s.style)
    }

    #[test]
    fn every_bundled_query_compiles() {
        for file in [
            "a.rs", "a.py", "a.js", "a.jsx", "a.ts", "a.tsx", "a.json", "a.c", "a.h",
        ] {
            assert!(Syntax::for_path(Path::new(file)).is_some(), "{file}");
        }
        assert!(Syntax::for_path(Path::new("notes.txt")).is_none());
    }

    #[test]
    fn rust_tokens_get_expected_styles() {
        let mut s = Syntax::for_path(Path::new("a.rs")).unwrap();
        let src = "fn main() { let x = \"hi\"; } // done";
        assert_eq!(style_of(&mut s, src, "fn"), style_for("keyword"));
        assert_eq!(style_of(&mut s, src, "main"), style_for("function"));
        assert_eq!(style_of(&mut s, src, "\"hi\""), style_for("string"));
        assert_eq!(style_of(&mut s, src, "// done"), style_for("comment"));
    }

    #[test]
    fn later_patterns_override_earlier_ones() {
        // The JavaScript query tags every identifier as a variable first and
        // refines function names afterwards.
        let mut s = Syntax::for_path(Path::new("a.js")).unwrap();
        assert_eq!(
            style_of(&mut s, "function foo() {}", "foo"),
            style_for("function")
        );
    }

    #[test]
    fn incremental_edit_matches_a_fresh_parse() {
        let before = "fn a() {}\nfn b() {}\n";
        let after = "fn a() {}\n// note\nfn b() {}\n";

        let mut buf = crate::buffer::Buffer::open(Path::new("/nonexistent/x.rs")).unwrap();
        buf.insert(0, before);
        buf.highlights(0..before.len());
        buf.insert(10, "// note\n");
        let incremental = buf.highlights(0..after.len());

        let mut fresh = Syntax::for_path(Path::new("x.rs")).unwrap();
        let expected = fresh.highlights(&Rope::from_str(after), 0..after.len());

        let key = |v: &[Span]| {
            v.iter()
                .map(|s| (s.start, s.end, s.style))
                .collect::<Vec<_>>()
        };
        assert_eq!(key(&incremental), key(&expected));
        assert!(incremental.iter().any(|s| s.start == 10 && s.end == 17));
    }
}
