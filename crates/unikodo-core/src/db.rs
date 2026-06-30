use std::sync::OnceLock;

use crate::symbol::Symbol;

/// The embedded `unicode-math-table.tex` (vendored from the `unicode-math`
/// package; see `data/README.md`).
const TABLE: &str = include_str!("../data/unicode-math-table.tex");

/// All symbols defined by the embedded table.
///
/// The table is parsed once, on first access, and cached for the lifetime of the
/// program. Symbols appear in table order (i.e. by increasing code point).
pub fn symbols() -> &'static [Symbol] {
    static SYMBOLS: OnceLock<Vec<Symbol>> = OnceLock::new();
    SYMBOLS
        .get_or_init(|| TABLE.lines().filter_map(parse_line).collect())
        .as_slice()
}

/// Completion candidates for a macro `prefix` — the text *after* the leading
/// backslash. Matches macro names that start with `prefix`, preserving table
/// order.
///
/// When `include_ascii` is `false`, symbols whose character is ASCII are skipped
/// (the default for editor completions; see [`Symbol::is_ascii`]).
pub fn complete(prefix: &str, include_ascii: bool) -> impl Iterator<Item = &'static Symbol> + '_ {
    symbols()
        .iter()
        .filter(move |s| (include_ascii || !s.is_ascii()) && s.name.starts_with(prefix))
}

/// Parse a single `\UnicodeMathSymbol{"HEX}{\macro}{\class}{description}%` line.
///
/// Returns `None` for comments, blank lines, and anything that does not match
/// the expected shape, so it can be used directly with [`Iterator::filter_map`].
fn parse_line(line: &'static str) -> Option<Symbol> {
    let rest = line.strip_prefix("\\UnicodeMathSymbol{\"")?;
    let (hex, rest) = rest.split_once('}')?;
    let ch = char::from_u32(u32::from_str_radix(hex.trim(), 16).ok()?)?;

    // Macro and class fields carry a leading backslash and trailing padding.
    let (name, rest) = field(rest)?;
    let name = name.strip_prefix('\\')?.trim_end();

    let (class, rest) = field(rest)?;
    let class = class.strip_prefix('\\')?.trim_end();

    let (description, _) = field(rest)?;

    Some(Symbol {
        name,
        ch,
        class,
        description,
    })
}

/// Pull the next `{...}` group off the front of `s`, returning its inner text and
/// the remainder after the closing brace.
fn field(s: &str) -> Option<(&str, &str)> {
    s.strip_prefix('{')?.split_once('}')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn find(name: &str) -> &'static Symbol {
        symbols()
            .iter()
            .find(|s| s.name == name)
            .unwrap_or_else(|| panic!("expected symbol `{name}` to exist"))
    }

    #[test]
    fn parses_every_macro_line() {
        // Each `\UnicodeMathSymbol` line must produce exactly one symbol.
        let macro_lines = TABLE
            .lines()
            .filter(|l| l.starts_with("\\UnicodeMathSymbol"))
            .count();
        assert_eq!(symbols().len(), macro_lines);
    }

    #[test]
    fn expected_snapshot_count() {
        // Tracks the currently vendored table; bump intentionally when updating
        // (see scripts/update-unicode-math-table.sh).
        assert_eq!(symbols().len(), 2448);
    }

    #[test]
    fn known_symbols() {
        let leq = find("leq");
        assert_eq!(leq.ch, '≤');
        assert_eq!(leq.codepoint(), 0x2264);
        assert_eq!(leq.usv(), "U+2264");
        assert_eq!(leq.class, "mathrel");

        assert_eq!(find("lparen").ch, '(');
        assert_eq!(find("BbbR").ch, 'ℝ');
        assert_eq!(find("in").ch, '∈');
        assert_eq!(find("mupalpha").ch, 'α');
    }

    #[test]
    fn names_are_trimmed_and_nonempty() {
        assert!(symbols().iter().all(|s| s.name == s.name.trim()));
        assert!(symbols().iter().all(|s| !s.name.is_empty()));
        assert!(symbols().iter().all(|s| !s.class.is_empty()));
    }

    #[test]
    fn complete_matches_prefix() {
        let names: Vec<_> = complete("leq", false).map(|s| s.name).collect();
        assert!(names.contains(&"leq"));
        assert!(names.iter().all(|n| n.starts_with("leq")));
    }

    #[test]
    fn complete_excludes_ascii_by_default() {
        // \lparen -> '(' is ASCII: hidden by default, shown when asked.
        assert!(!complete("lparen", false).any(|s| s.name == "lparen"));
        assert!(complete("lparen", true).any(|s| s.name == "lparen" && s.ch == '('));
    }
}
