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
    let mut ed = Editor::open(std::slice::from_ref(&path)).unwrap();
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

fn ctrl(ed: &mut Editor, c: char) {
    ed.handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::CONTROL));
}

#[test]
fn counts_repeat_motions_and_operators() {
    assert_eq!(run("a b c d e", "3w").1, 6);
    assert_eq!(run("a b c d e", "d2w").0, "c d e");
    assert_eq!(run("a b c d e", "2dw").0, "c d e");
    assert_eq!(run("1\n2\n3\n4\n5", "3dd").0, "4\n5");
    assert_eq!(run("1\n2\n3\n4\n5", "d2j").0, "4\n5");
    assert_eq!(run("1\n2\n3\n4\n5", "3G").1, 4);
    assert_eq!(run("1\n2\n3\n4\n5", "G2gg").1, 2);
    assert_eq!(run("abcdef", "3x").0, "def");
    assert_eq!(run("abcdef", "$2X").0, "abcf");
    assert_eq!(run("ab", "yl3p").0, "aaaab");
    assert_eq!(run("a\nb", "yy2p").0, "a\na\na\nb");
    assert_eq!(run("a b c d", "c2wx\x1b").0, "x c d");
    // A zero after a digit is part of the count; alone it is a motion.
    let text: String = (1..=12).map(|i| format!("{i}\n")).collect();
    assert_eq!(editor_after(&text, "10G").line(), 9);
    assert_eq!(run("abc", "$0").1, 0);
}

fn editor_after(before: &str, keys: &str) -> Editor {
    let mut ed = editor(before);
    feed(&mut ed, keys);
    ed
}

#[test]
fn dot_repeats_the_last_change() {
    assert_eq!(run("a b c d", "dw.").0, "c d");
    assert_eq!(run("a b c d", "dw..").0, "d");
    assert_eq!(run("1\n2\n3\n4", "dd.").0, "3\n4");
    assert_eq!(run("a\nb\nc", "A!\x1bj.j.").0, "a!\nb!\nc!");
    assert_eq!(run("one two three", "cwX\x1bw.").0, "X X three");
    assert_eq!(run("a", "ox\x1b.").0, "a\nx\nx");
    assert_eq!(run("abcd", "x.").0, "cd");
    assert_eq!(run("a b c", "2dw.").0, "");
    // Moving, undoing and ex commands do not replace what `.` repeats.
    assert_eq!(run("abcdef", "xlu:1\n.").0, "bcdef");
    // The repeat is a single undo step.
    assert_eq!(run("a\nb", "Axy\x1bj.u").0, "axy\nb");
    assert_eq!(run("abc", ".").0, "abc");
}

#[test]
fn text_objects() {
    assert_eq!(run("one two three", "wlciwX\x1b").0, "one X three");
    assert_eq!(run("one two three", "wdaw").0, "one three");
    assert_eq!(run("one two", "wdaw").0, "one");
    assert_eq!(run("f(a, (b), c)", "fbdi(").0, "f(a, (), c)");
    assert_eq!(run("f(a, (b), c)", "fadi(").0, "f()");
    assert_eq!(run("f(a, (b), c)", "fada(").0, "f");
    assert_eq!(run("x = {\n  a\n}", "jdiB").0, "x = {}");
    assert_eq!(run("v[1]", "f1ci]2\x1b").0, "v[2]");
    assert_eq!(
        run("say \"hi there\" now", "ci\"yo\x1b").0,
        "say \"yo\" now"
    );
    assert_eq!(run("say \"hi there\" now", "fhda\"").0, "say  now");
    assert_eq!(run("a 'b' c", "fbyi'$p").0, "a 'b' cb");
    assert_eq!(run("()", "ci(x\x1b").0, "(x)");
    assert_eq!(run("one two", "wviwd").0, "one ");
    // Outside any pair, the next one on the line is used.
    assert_eq!(run("print(add(1, 2))", "ci(x\x1b").0, "print(x)");
    assert_eq!(run("a = [1] + [2]", "di[").0, "a = [] + [2]");
    // No enclosing pair: nothing happens.
    assert_eq!(run("abc", "di(").0, "abc");
}

#[test]
fn find_percent_and_paragraph_motions() {
    assert_eq!(run("a,b,c,d", "f,").1, 1);
    assert_eq!(run("a,b,c,d", "f,;").1, 3);
    assert_eq!(run("a,b,c,d", "f,;;,").1, 3);
    assert_eq!(run("a,b,c,d", "2f,").1, 3);
    assert_eq!(run("a,b,c,d", "tc;").1, 3);
    assert_eq!(run("a,b,c,d", "tc").1, 3);
    assert_eq!(run("a,b,c,d", "$F,").1, 5);
    assert_eq!(run("a,b,c,d", "$Tb").1, 3);
    assert_eq!(run("a,b,c,d", "df,").0, "b,c,d");
    assert_eq!(run("a,b,c,d", "dt,").0, ",b,c,d");
    assert_eq!(run("a,b,c,d", "$dF,").0, "a,b,cd");
    assert_eq!(run("a,b", "fz").1, 0);
    assert_eq!(run("if (a[0]) { b }", "%").1, 8);
    assert_eq!(run("if (a[0]) { b }", "%%").1, 3);
    assert_eq!(run("if (a[0]) { b }", "$%").1, 10);
    assert_eq!(run("x (a) y", "wd%").0, "x  y");
    assert_eq!(run("x (a) y", "d%").0, " y");
    let ed = editor_after("a\nb\n\nc\nd\n\ne", "}");
    assert_eq!(ed.line(), 2);
    assert_eq!(editor_after("a\nb\n\nc\nd\n\ne", "}}").line(), 5);
    assert_eq!(editor_after("a\nb\n\nc\nd\n\ne", "G{").line(), 5);
    assert_eq!(run("a\nb\n\nc", "d}").0, "\nc");
}

#[test]
fn small_editing_commands() {
    assert_eq!(run("abc", "rx").0, "xbc");
    assert_eq!(run("abc", "2rx").0, "xxc");
    assert_eq!(run("abc", "5rx").0, "abc");
    assert_eq!(run("aBc", "3~").0, "AbC");
    assert_eq!(run("a\n  b\nc", "J").0, "a b\nc");
    assert_eq!(run("a\n  b\nc", "3J").0, "a b c");
    assert_eq!(run("a\n\nb", "J").0, "a\nb");
    assert_eq!(run("abc", "sx\x1b").0, "xbc");
    assert_eq!(run("  abc\nd", "Sx\x1b").0, "  x\nd");
    assert_eq!(run("a\nb", "Yp").0, "a\na\nb");
    assert_eq!(run("a\nb", ">>").0, "    a\nb");
    assert_eq!(run("a\nb", ">j").0, "    a\n    b");
    assert_eq!(run("        a", "<<").0, "    a");
    assert_eq!(run("  a\n\tb", "<j").0, "a\nb");
    assert_eq!(run("a\n\nb", "Vjj>").0, "    a\n\n    b");
    assert_eq!(run("abc def", "vlohd").0, "c def");
}

#[test]
fn regex_search_and_smartcase() {
    let mut ed = editor("foo1 Foo22 foo333");
    feed(&mut ed, "/o\\d+\n");
    assert_eq!(ed.cursor, 2);
    feed(&mut ed, "n");
    assert_eq!(ed.cursor, 7);
    // Lower-case patterns ignore case; a capital makes them exact.
    feed(&mut ed, "0/foo\nn");
    assert_eq!(ed.cursor, 11);
    feed(&mut ed, "0/Foo\nn");
    assert_eq!(ed.cursor, 5);
    feed(&mut ed, "/(\n");
    assert_eq!(ed.message, "Invalid pattern: (");
    assert!(ed.search_pattern().is_some());
    feed(&mut ed, ":noh\n");
    assert!(ed.search_pattern().is_none());
}

#[test]
fn backward_search_and_star() {
    let mut ed = editor("ab abc ab\nab");
    feed(&mut ed, "$?ab\n");
    assert_eq!(ed.cursor, 7);
    feed(&mut ed, "n");
    assert_eq!(ed.cursor, 3);
    feed(&mut ed, "N");
    assert_eq!(ed.cursor, 7);
    // `*` matches whole words only, so it skips "abc".
    feed(&mut ed, "0*");
    assert_eq!(ed.cursor, 7);
    feed(&mut ed, "2n");
    assert_eq!(ed.cursor, 0);
}

#[test]
fn substitute() {
    assert_eq!(run("a a\na a", ":s/a/b\n").0, "b a\na a");
    assert_eq!(run("a a\na a", ":s/a/b/g\n").0, "b b\na a");
    assert_eq!(run("a a\na a", ":%s/a/b/g\n").0, "b b\nb b");
    assert_eq!(run("a a\na a", ":%s/a/b/g\nu").0, "a a\na a");
    assert_eq!(
        run("john smith", ":s/(\\w+) (\\w+)/\\2, \\1\n").0,
        "smith, john"
    );
    assert_eq!(run("cost", ":s/cost/$5 & more\n").0, "$5 cost more");
    assert_eq!(run("a/b", ":s#/#\\\\#\n").0, "a\\b");
    assert_eq!(run("a/b", ":s/\\//-/\n").0, "a-b");
    assert_eq!(run("Aa", ":s/a/x/gi\n").0, "xx");
    let ed = editor_after("abc", ":%s/z/y/\n");
    assert_eq!(ed.message, "Pattern not found: z");
    assert_eq!(
        editor_after("a a\na", ":%s/a/b/g\n").message,
        "3 substitution(s) on 2 line(s)"
    );
}

#[test]
fn multiple_buffers() {
    let dir = tempfile::tempdir().unwrap();
    let paths: Vec<_> = ["a.txt", "b.txt", "c.txt"]
        .iter()
        .map(|n| dir.path().join(n))
        .collect();
    for (p, text) in paths.iter().zip(["aaa\naaa", "bbb", "ccc"]) {
        std::fs::write(p, text).unwrap();
    }
    let mut ed = Editor::open(&paths[..2]).unwrap();
    feed(&mut ed, "jl");
    feed(&mut ed, ":bn\n");
    assert_eq!(text(&ed), "bbb");
    feed(&mut ed, &format!(":e {}\n", paths[2].display()));
    assert_eq!(text(&ed), "ccc");
    // The ring is a -> b -> c, and each buffer keeps its cursor.
    feed(&mut ed, ":bn\n");
    assert_eq!((text(&ed).as_str(), ed.cursor), ("aaa\naaa", 5));
    feed(&mut ed, ":bp\n");
    assert_eq!(text(&ed), "ccc");
    feed(&mut ed, &format!(":e {}\n", paths[1].display()));
    assert_eq!((text(&ed).as_str(), ed.others.len()), ("bbb", 2));

    // Unsaved changes in any buffer block quitting; undo is per buffer.
    feed(&mut ed, "x:bn\n:q\n");
    assert!(!ed.quit && ed.message.starts_with("No write"));
    feed(&mut ed, ":ls\n");
    assert!(ed.message.contains("b.txt [+]"), "{}", ed.message);
    feed(&mut ed, "u");
    assert_eq!(text(&ed), "ccc");
    feed(&mut ed, ":wa\n");
    assert_eq!(std::fs::read_to_string(&paths[1]).unwrap(), "bb");
    feed(&mut ed, ":bd\n:bd\n:bd\n");
    assert_eq!(
        (ed.others.len(), ed.message.as_str()),
        (0, "Cannot close the last buffer")
    );
    feed(&mut ed, ":q\n");
    assert!(ed.quit);
}

#[test]
fn utf16_positions_convert_both_ways() {
    // '😀' is one char but two UTF-16 code units.
    let ed = editor("a\n😀b\n");
    assert_eq!(ed.char_to_lsp(3), (1, 2));
    assert_eq!(ed.lsp_to_char(1, 2), 3);
    assert_eq!(ed.lsp_to_char(1, 99), 4);
    assert_eq!(ed.lsp_to_char(99, 0), 5);
}

/// A scripted language server: answers initialize, publishes one diagnostic
/// when a document opens, and replies to the three requests xe makes.
const FAKE_SERVER: &str = r#"
import json, sys
def send(m):
    b = json.dumps(m).encode()
    sys.stdout.buffer.write(b"Content-Length: %d\r\n\r\n" % len(b) + b)
    sys.stdout.buffer.flush()
while True:
    n = 0
    while True:
        h = sys.stdin.buffer.readline()
        if not h: sys.exit(0)
        h = h.strip()
        if not h: break
        if h.lower().startswith(b"content-length:"): n = int(h.split(b":")[1])
    m = json.loads(sys.stdin.buffer.read(n))
    method, p = m.get("method"), m.get("params")
    if method == "initialize":
        send({"jsonrpc": "2.0", "id": m["id"], "result": {"capabilities": {}}})
        send({"jsonrpc": "2.0", "id": 99, "method": "workspace/configuration", "params": {"items": [{}]}})
    elif method == "textDocument/didOpen":
        uri = p["textDocument"]["uri"]
        send({"jsonrpc": "2.0", "method": "textDocument/publishDiagnostics", "params": {"uri": uri, "diagnostics": [
            {"range": {"start": {"line": 0, "character": 3}, "end": {"line": 0, "character": 7}},
             "severity": 1, "message": "seen: " + p["textDocument"]["text"].split("\n")[0]}]}})
    elif method == "textDocument/definition":
        send({"jsonrpc": "2.0", "id": m["id"], "result": {"uri": p["textDocument"]["uri"],
            "range": {"start": {"line": 1, "character": 4}, "end": {"line": 1, "character": 5}}}})
    elif method == "textDocument/hover":
        send({"jsonrpc": "2.0", "id": m["id"], "result": {"contents": {"kind": "markdown", "value": "```\nfn main()\n```\nEntry point"}}})
    elif method == "textDocument/completion":
        send({"jsonrpc": "2.0", "id": m["id"], "result": [
            {"label": "println", "detail": "macro"}, {"label": "print"}, {"label": "panic"}]})
"#;

/// Run `tick` until `done` holds or a few seconds pass.
fn wait_for(ed: &mut Editor, done: impl Fn(&Editor) -> bool) -> bool {
    for _ in 0..300 {
        ed.tick();
        if done(ed) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    false
}

#[test]
fn language_server_round_trip() {
    if std::process::Command::new("python3")
        .arg("--version")
        .output()
        .is_err()
    {
        eprintln!("python3 not found; skipping");
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let script = dir.path().join("server.py");
    let file = dir.path().join("main.rs");
    std::fs::write(&script, FAKE_SERVER).unwrap();
    std::fs::write(&file, "fn main() {\n    pr\n}\n").unwrap();

    let mut ed = Editor::open(std::slice::from_ref(&file)).unwrap();
    ed.lsp.enable();
    ed.lsp
        .set_server("rust", vec!["python3".into(), script.display().to_string()]);

    // Opening the file sends its text; the diagnostic comes back.
    assert!(wait_for(&mut ed, |ed| !ed
        .lsp
        .diagnostics(&file)
        .is_empty()));
    let diagnostic = &ed.lsp.diagnostics(&file)[0];
    assert_eq!(
        (diagnostic.start, diagnostic.message.as_str()),
        ((0, 3), "seen: fn main() {")
    );

    feed(&mut ed, "gd");
    assert!(wait_for(&mut ed, |ed| ed.cursor == 16));
    ctrl(&mut ed, 'o');
    assert_eq!(ed.cursor, 0);

    feed(&mut ed, "K");
    assert!(wait_for(&mut ed, |ed| !ed.popup.is_empty()));
    assert_eq!(ed.popup, ["fn main()", "Entry point"]);

    // Typing asks for completions; the list narrows as the word grows, and
    // accepting replaces the typed prefix.
    feed(&mut ed, "jA");
    assert!(ed.popup.is_empty());
    feed(&mut ed, "i");
    assert!(wait_for(&mut ed, |ed| ed.completion.is_some()));
    let labels = |ed: &Editor| {
        ed.completion_items()
            .iter()
            .map(|i| i.label.clone())
            .collect::<Vec<_>>()
    };
    assert_eq!(labels(&ed), ["print", "println"]);
    ctrl(&mut ed, 'n');
    feed(&mut ed, "\t");
    assert!(ed.completion.is_none());
    assert_eq!(text(&ed), "fn main() {\n    println\n}\n");

    // `.` repeats the completed text, not the popup keys.
    feed(&mut ed, "\x1bgg.");
    assert_eq!(text(&ed), "fn main() {intln\n    println\n}\n");
}

#[test]
fn without_a_server_lsp_keys_explain_themselves() {
    let mut ed = editor("abc");
    feed(&mut ed, "gd");
    assert_eq!(ed.message, "No language server for this buffer");
    feed(&mut ed, "ix\x1b");
    assert!(ed.completion.is_none());
}
