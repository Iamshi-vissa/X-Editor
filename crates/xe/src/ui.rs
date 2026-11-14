//! Rendering: turns the editor state into terminal cells.
//!
//! Only the visible lines are read from the rope and only their byte range is
//! highlighted, so drawing costs the same for a small file and a huge one.

use ratatui::buffer::Buffer as Screen;
use ratatui::layout::Position;
use ratatui::style::{Color, Modifier, Style};
use ratatui::Frame;

use crate::editor::{char_width, Editor, Mode};

/// Highlight styles are looked up per byte; lines longer than this are only
/// coloured up to the limit.
const MAX_STYLED_BYTES: usize = 16 * 1024;

pub fn draw(frame: &mut Frame, ed: &mut Editor) {
    let area = frame.area();
    if area.height < 3 || area.width < 12 {
        return;
    }
    let (x0, y0, width) = (area.x, area.y, area.width as usize);
    let text_h = area.height as usize - 2;
    let line_count = ed.buf.line_count();
    let gutter = line_count.to_string().len().max(3) + 1;
    let text_w = width - gutter;
    ed.scroll_into_view(text_h, text_w);

    let (top, left) = (ed.top, ed.left);
    let bottom = (top + text_h).min(line_count);
    let byte_lo = ed.buf.rope().line_to_byte(top);
    let byte_hi = if bottom < line_count {
        ed.buf.rope().line_to_byte(bottom)
    } else {
        ed.buf.rope().len_bytes()
    };
    let spans = ed.buf.highlights(byte_lo..byte_hi);
    let selection = ed.selection();
    let search = ed.search_pattern().cloned();
    // Diagnostics for this buffer as (start char, end char, severity).
    let marks: Vec<(usize, usize, u64)> = ed
        .buf
        .path()
        .map(|path| ed.lsp.diagnostics(path))
        .unwrap_or_default()
        .iter()
        .map(|d| {
            let from = ed.lsp_to_char(d.start.0, d.start.1);
            let to = ed.lsp_to_char(d.end.0, d.end.1);
            (from, to.max(from + 1), d.severity)
        })
        .collect();
    let search_or_diag_free = search.is_none() && marks.is_empty();
    let cursor_line = ed.line();
    let rope = ed.buf.rope();
    let screen = frame.buffer_mut();
    let dim = Style::new().fg(Color::DarkGray);
    let mut styles: Vec<Style> = Vec::new();

    for row in 0..text_h {
        let line = top + row;
        let y = y0 + row as u16;
        if line >= line_count {
            screen.set_string(x0, y, "~", dim);
            continue;
        }
        let (start, end) = (ed.buf.line_start(line), ed.buf.line_end(line));
        // A line with a diagnostic gets its number in the diagnostic's colour.
        let worst = marks
            .iter()
            .filter(|&&(from, to, _)| from <= end && to > start || from == start)
            .map(|m| m.2)
            .min();
        let number_style = match worst {
            Some(severity) => Style::new().fg(severity_color(severity)),
            None if line == cursor_line => Style::new().fg(Color::Yellow),
            None => dim,
        };
        screen.set_string(
            x0,
            y,
            format!("{:>w$} ", line + 1, w = gutter - 1),
            number_style,
        );

        let line_byte = rope.line_to_byte(line);
        let line_bytes = (rope.char_to_byte(end) - line_byte).min(MAX_STYLED_BYTES);

        styles.clear();
        styles.resize(line_bytes, Style::new());
        for span in &spans {
            let from = span.start.max(line_byte);
            let to = span.end.min(line_byte + line_bytes);
            if from < to {
                styles[from - line_byte..to - line_byte].fill(span.style);
            }
        }

        // Search matches and diagnostics are layered over the syntax colours.
        if !search_or_diag_free && line_bytes > 0 && line_bytes < MAX_STYLED_BYTES {
            let text = rope
                .byte_slice(line_byte..line_byte + line_bytes)
                .to_string();
            if let Some(regex) = &search {
                for m in regex.find_iter(&text).filter(|m| !m.is_empty()) {
                    styles[m.range()].fill(Style::new().bg(Color::Yellow).fg(Color::Black));
                }
            }
            for &(from, to, severity) in &marks {
                let from = rope.char_to_byte(from.max(start)).max(line_byte) - line_byte;
                let to = rope
                    .char_to_byte(to.min(end))
                    .min(line_byte + line_bytes)
                    .max(line_byte)
                    - line_byte;
                for style in styles.iter_mut().take(to).skip(from) {
                    *style = style
                        .add_modifier(Modifier::UNDERLINED)
                        .underline_color(severity_color(severity));
                }
            }
        }

        let (mut col, mut byte) = (0, 0);
        let text_x = x0 + gutter as u16;
        // One char past the end stands for the line break, so a selection
        // that includes it is visible.
        for (i, ch) in rope
            .slice(start..end)
            .chars()
            .chain(std::iter::once('\n'))
            .enumerate()
        {
            if col >= left + text_w {
                break;
            }
            let is_break = start + i == end;
            let selected = selection.as_ref().is_some_and(|s| s.contains(&(start + i)));
            if is_break && !(selected && start + i < ed.buf.len()) {
                break;
            }
            let w = if is_break { 1 } else { char_width(ch, col) };
            let mut style = styles.get(byte).copied().unwrap_or_default();
            if selected {
                style = style.add_modifier(Modifier::REVERSED);
            }
            let fits = col >= left && col + w <= left + text_w;
            if fits && !ch.is_control() {
                screen.set_string(
                    text_x + (col - left) as u16,
                    y,
                    ch.encode_utf8(&mut [0; 4]),
                    style,
                );
            } else {
                // Tabs, control characters and wide characters cut by the
                // edge of the window are drawn as blanks.
                for c in col.max(left)..(col + w).min(left + text_w) {
                    screen.set_string(text_x + (c - left) as u16, y, " ", style);
                }
            }
            col += w;
            byte += ch.len_utf8();
        }
    }

    // Status line.
    let status_y = y0 + text_h as u16;
    let bar = Style::new().add_modifier(Modifier::REVERSED);
    let mode = match ed.mode {
        Mode::Normal | Mode::Command | Mode::Search => "NORMAL",
        Mode::Insert => "INSERT",
        Mode::Visual => "VISUAL",
        Mode::VisualLine => "V-LINE",
    };
    // Show paths inside the working directory relative to it.
    let cwd = std::env::current_dir().unwrap_or_default();
    let name = ed.buf.path().map_or("[No Name]".to_string(), |p| {
        p.strip_prefix(&cwd).unwrap_or(p).display().to_string()
    });
    let flag = if ed.buf.modified() { " [+]" } else { "" };
    let more = match ed.others.len() {
        0 => String::new(),
        n => format!("  (+{n} more)"),
    };
    let left_text = format!(" {mode}  {name}{flag}{more}");
    let col = ed.cursor - ed.buf.line_start(cursor_line) + 1;
    let right_text = format!(
        "{}  {}:{} ",
        ed.buf.language().unwrap_or("text"),
        cursor_line + 1,
        col
    );
    screen.set_string(x0, status_y, " ".repeat(width), bar);
    screen.set_stringn(x0, status_y, &left_text, width, bar);
    if left_text.chars().count() + right_text.len() < width {
        screen.set_string(
            x0 + (width - right_text.len()) as u16,
            status_y,
            &right_text,
            bar,
        );
    }

    // Bottom line: the prompt while typing a command, otherwise the last message.
    let prompt_y = status_y + 1;
    let prompt = match ed.mode {
        Mode::Command => format!(":{}", ed.cmdline),
        Mode::Search => format!(
            "{}{}",
            if ed.search_forward { '/' } else { '?' },
            ed.cmdline
        ),
        _ if !ed.message.is_empty() => ed.message.clone(),
        // With nothing else to say, show the diagnostic on the cursor's line.
        _ => {
            let (start, end) = (ed.buf.line_start(cursor_line), ed.buf.line_end(cursor_line));
            let on_line = |d: &&crate::lsp::Diagnostic| {
                let pos = ed.lsp_to_char(d.start.0, d.start.1);
                d.start.0 == cursor_line && pos >= start && pos <= end
            };
            let found = ed.buf.path().and_then(|p| {
                ed.lsp
                    .diagnostics(p)
                    .iter()
                    .filter(on_line)
                    .min_by_key(|d| d.severity)
            });
            found.map_or(String::new(), |d| {
                d.message.lines().next().unwrap_or_default().to_string()
            })
        }
    };
    screen.set_stringn(x0, prompt_y, &prompt, width, Style::new());

    let cursor = match ed.mode {
        Mode::Command | Mode::Search => (
            x0 + (prompt.chars().count().min(width - 1)) as u16,
            prompt_y,
        ),
        _ => (
            x0 + (gutter + ed.display_col(ed.cursor) - left) as u16,
            y0 + (cursor_line - top) as u16,
        ),
    };

    // Popups open under the cursor, or above it when there is no room below.
    if !matches!(ed.mode, Mode::Command | Mode::Search) {
        let items = ed.completion_items();
        let (lines, selected, anchor): (Vec<String>, Option<usize>, usize) = match &ed.completion {
            Some(c) if !items.is_empty() => {
                let first = c
                    .selected
                    .min(items.len() - 1)
                    .saturating_sub(MAX_POPUP_ROWS - 1);
                let label = items
                    .iter()
                    .map(|i| i.label.chars().count())
                    .max()
                    .unwrap_or(0)
                    .min(40);
                let rows = items.iter().skip(first).take(MAX_POPUP_ROWS);
                let lines = rows
                    .map(|i| format!("{:<label$}  {}", i.label, i.detail))
                    .collect();
                (
                    lines,
                    Some(c.selected.min(items.len() - 1) - first),
                    ed.display_col(c.start),
                )
            }
            _ => (ed.popup.clone(), None, ed.display_col(ed.cursor)),
        };
        let column = x0 + (gutter + anchor.saturating_sub(left)) as u16;
        let area = (x0, y0, width as u16, text_h as u16);
        popup(
            frame.buffer_mut(),
            area,
            (column, cursor.1),
            &lines,
            selected,
        );
    }
    frame.set_cursor_position(Position::from(cursor));
}

const MAX_POPUP_ROWS: usize = 8;

fn severity_color(severity: u64) -> Color {
    match severity {
        1 => Color::Red,
        2 => Color::Yellow,
        _ => Color::Blue,
    }
}

/// Draw a box of `lines` next to the cell `at`, inside `area` (x, y, width, height).
fn popup(
    screen: &mut Screen,
    area: (u16, u16, u16, u16),
    at: (u16, u16),
    lines: &[String],
    selected: Option<usize>,
) {
    let (ax, ay, aw, ah) = area;
    let below = (ay + ah).saturating_sub(at.1 + 1) as usize;
    let above = (at.1 - ay) as usize;
    let rows = lines.len().min(MAX_POPUP_ROWS.max(1)).min(below.max(above));
    if rows == 0 || aw < 4 {
        return;
    }
    let width = lines
        .iter()
        .take(rows)
        .map(|l| l.chars().count())
        .max()
        .unwrap_or(0)
        .min(aw as usize - 2)
        + 2;
    let x = at.0.min(ax + aw - width as u16);
    let y = if below >= rows {
        at.1 + 1
    } else {
        at.1 - rows as u16
    };
    let base = Style::new().bg(Color::DarkGray).fg(Color::White);
    for (i, line) in lines.iter().take(rows).enumerate() {
        let style = if selected == Some(i) {
            base.add_modifier(Modifier::REVERSED)
        } else {
            base
        };
        let y = y + i as u16;
        screen.set_string(x, y, " ".repeat(width), style);
        // Replace characters the cell grid cannot place, such as tabs.
        let clean: String = line
            .chars()
            .map(|c| if c.is_control() { ' ' } else { c })
            .collect();
        screen.set_stringn(x + 1, y, clean, width - 2, style);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::editor::tests::{editor, feed};
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;

    fn render(ed: &mut Editor, w: u16, h: u16) -> (Vec<String>, Position, Terminal<TestBackend>) {
        let mut terminal = Terminal::new(TestBackend::new(w, h)).unwrap();
        terminal.draw(|f| draw(f, ed)).unwrap();
        let buffer = terminal.backend().buffer().clone();
        let lines = (0..h)
            .map(|y| {
                (0..w)
                    .map(|x| buffer[(x, y)].symbol())
                    .collect::<String>()
                    .trim_end()
                    .to_string()
            })
            .collect();
        let cursor = terminal.get_cursor_position().unwrap();
        (lines, cursor, terminal)
    }

    #[test]
    fn draws_text_gutter_status_and_cursor() {
        let mut ed = editor("first\n\tsecond\nthird");
        feed(&mut ed, "jw");
        let (lines, cursor, _) = render(&mut ed, 40, 6);
        assert_eq!(lines[0], "  1 first");
        assert_eq!(lines[1], "  2     second");
        assert_eq!(lines[2], "  3 third");
        assert_eq!(lines[3], "~");
        assert!(lines[4].starts_with(" NORMAL  [No Name]"));
        assert!(lines[4].ends_with("text  2:2"));
        // The tab occupies four cells, so the cursor is drawn after it.
        assert_eq!(cursor, Position::new(8, 1));
    }

    #[test]
    fn scrolls_vertically_and_horizontally() {
        let text: String = (1..=100).map(|i| format!("line {i}\n")).collect();
        let mut ed = editor(&text);
        feed(&mut ed, ":50\n");
        let (lines, cursor, _) = render(&mut ed, 30, 12);
        assert!(lines.iter().any(|l| l == " 50 line 50"));
        assert!(cursor.y < 10);
        assert!(ed.top > 0);

        let mut ed = editor(&"x".repeat(200));
        feed(&mut ed, "$");
        let (lines, cursor, _) = render(&mut ed, 30, 5);
        assert_eq!(lines[0], format!("  1 {}", "x".repeat(26)));
        assert_eq!(cursor, Position::new(29, 0));
    }

    #[test]
    fn wide_characters_take_two_cells() {
        let mut ed = editor("日本x");
        feed(&mut ed, "$");
        let (_, cursor, terminal) = render(&mut ed, 20, 4);
        assert_eq!(terminal.backend().buffer()[(4, 0)].symbol(), "日");
        assert_eq!(terminal.backend().buffer()[(8, 0)].symbol(), "x");
        assert_eq!(cursor, Position::new(8, 0));
    }

    #[test]
    fn selection_and_prompt_are_shown() {
        let mut ed = editor("abc\ndef");
        feed(&mut ed, "vj");
        let (lines, _, terminal) = render(&mut ed, 30, 5);
        let reversed = |x, y| {
            terminal.backend().buffer()[(x, y)]
                .modifier
                .contains(Modifier::REVERSED)
        };
        // All of line one including its line break, and the first char of line two.
        assert!(reversed(4, 0) && reversed(6, 0) && reversed(7, 0));
        assert!(reversed(4, 1) && !reversed(5, 1));
        assert!(lines[3].starts_with(" VISUAL"));

        feed(&mut ed, "\x1b:wq");
        let (lines, cursor, _) = render(&mut ed, 30, 5);
        assert_eq!(lines[4], ":wq");
        assert_eq!(cursor, Position::new(3, 4));
    }

    #[test]
    fn highlighted_tokens_are_coloured() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("m.rs");
        std::fs::write(&path, "fn main() {}\n").unwrap();
        let mut ed = Editor::open(std::slice::from_ref(&path)).unwrap();
        let (lines, _, terminal) = render(&mut ed, 40, 5);
        assert_eq!(lines[0], "  1 fn main() {}");
        assert_eq!(terminal.backend().buffer()[(4, 0)].fg, Color::Magenta);
        assert_eq!(terminal.backend().buffer()[(7, 0)].fg, Color::Blue);
        assert!(lines[3].ends_with("rust  1:1"));
    }

    #[test]
    fn tiny_terminal_does_not_panic() {
        let mut ed = editor("abc");
        render(&mut ed, 5, 2);
        render(&mut ed, 12, 3);
    }

    #[test]
    fn search_matches_are_highlighted() {
        let mut ed = editor("one two one");
        feed(&mut ed, "/one\n");
        let (_, _, terminal) = render(&mut ed, 30, 4);
        let bg = |x| terminal.backend().buffer()[(x, 0)].bg;
        assert_eq!(
            (bg(4), bg(6), bg(7), bg(12)),
            (Color::Yellow, Color::Yellow, Color::Reset, Color::Yellow)
        );
        feed(&mut ed, ":noh\n");
        let (_, _, terminal) = render(&mut ed, 30, 4);
        assert_eq!(terminal.backend().buffer()[(4, 0)].bg, Color::Reset);
    }

    #[test]
    fn diagnostics_mark_the_text_gutter_and_message_line() {
        use crate::lsp::Diagnostic;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.py");
        std::fs::write(&path, "x = 1\ny = oops\n").unwrap();
        let mut ed = Editor::open(std::slice::from_ref(&path)).unwrap();
        let warning = Diagnostic {
            start: (1, 4),
            end: (1, 8),
            severity: 1,
            message: "undefined name\nmore".into(),
        };
        ed.lsp.set_diagnostics(&path, vec![warning]);

        let (lines, _, terminal) = render(&mut ed, 40, 5);
        let cell = |x, y| terminal.backend().buffer()[(x, y)].clone();
        assert!(cell(8, 1).modifier.contains(Modifier::UNDERLINED));
        assert!(!cell(7, 1).modifier.contains(Modifier::UNDERLINED));
        assert_eq!((cell(2, 1).fg, cell(2, 0).fg), (Color::Red, Color::Yellow));
        assert_eq!(lines[4], "");

        // The message appears once the cursor is on the line.
        feed(&mut ed, "j");
        let (lines, _, _) = render(&mut ed, 40, 5);
        assert_eq!(lines[4], "undefined name");
    }

    #[test]
    fn hover_and_completion_popups() {
        use crate::lsp::{CompletionItem, Event};
        let mut ed = editor("ab\n\n\n\n");
        ed.on_lsp_event(Event::Hover("first\nsecond line".into()));
        let (lines, _, _) = render(&mut ed, 30, 8);
        assert_eq!(lines[1], "  2  first");
        assert_eq!(lines[2], "  3  second line");
        // Any key dismisses it.
        feed(&mut ed, "l");
        assert_eq!(render(&mut ed, 30, 8).0[1], "  2");

        feed(&mut ed, "A");
        let item = |label: &str| CompletionItem {
            label: label.into(),
            insert: label.into(),
            detail: "fn".into(),
        };
        let items = vec![item("abacus"), item("abc"), item("zzz")];
        ed.on_lsp_event(Event::Completion {
            revision: ed.buf.revision(),
            items,
        });
        let (lines, _, terminal) = render(&mut ed, 30, 8);
        assert_eq!(lines[1], "  2  abacus  fn");
        assert_eq!(lines[2], "  3  abc     fn");
        assert_eq!(lines[3], "  4");
        assert!(terminal.backend().buffer()[(5, 1)]
            .modifier
            .contains(Modifier::REVERSED));
        assert!(!terminal.backend().buffer()[(5, 2)]
            .modifier
            .contains(Modifier::REVERSED));

        // At the bottom of the window the popup opens upwards.
        let mut ed = editor("\n\n\n\nab");
        feed(&mut ed, "G");
        ed.on_lsp_event(Event::Hover("tip".into()));
        let (lines, _, _) = render(&mut ed, 30, 7);
        assert_eq!(lines[3], "  4  tip");
    }
}
