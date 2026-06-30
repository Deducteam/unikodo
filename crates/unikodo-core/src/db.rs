use std::collections::BTreeSet;
use std::sync::OnceLock;

use crate::scheme;
use crate::symbol::Symbol;

/// The embedded `unicode-math-table.tex` (vendored from the `unicode-math`
/// package; see `data/README.md`).
const TABLE: &str = include_str!("../data/unicode-math-table.tex");

/// Starter set of ASCII digraph aliases: `(name, character, description)`.
///
/// These map punctuation sequences to the non-ASCII characters they evoke. It is
/// deliberately small and uncontroversial; richer/Typst schemes can be added the
/// same way (their own table tagged with their scheme id).
const ASCII_ALIASES: &[(&str, char, &str)] = &[
    ("->", '→', "rightwards arrow"),
    ("<-", '←', "leftwards arrow"),
    ("<->", '↔', "left right arrow"),
    ("=>", '⇒', "rightwards double arrow"),
    ("<=", '≤', "less-than or equal to"),
    (">=", '≥', "greater-than or equal to"),
    ("!=", '≠', "not equal to"),
    ("|->", '↦', "maps to"),
    ("+-", '±', "plus-minus sign"),
    ("-+", '∓', "minus-plus sign"),
    ("<=>", '⇔', "left right double arrow"),
    ("...", '…', "horizontal ellipsis"),
];

/// All symbols across every built-in scheme.
///
/// Parsed once, on first access, and cached for the lifetime of the program.
/// `unicode-math` entries appear first (in table order), then the ASCII aliases.
/// Each [`Symbol`] is tagged with its [`scheme`](crate::scheme).
pub fn symbols() -> &'static [Symbol] {
    static SYMBOLS: OnceLock<Vec<Symbol>> = OnceLock::new();
    SYMBOLS
        .get_or_init(|| {
            let mut all: Vec<Symbol> = TABLE.lines().filter_map(parse_line).collect();
            all.extend(ASCII_ALIASES.iter().map(|&(name, ch, description)| Symbol {
                scheme: scheme::ASCII,
                name,
                ch,
                class: None,
                description,
            }));
            all
        })
        .as_slice()
}

/// Completion candidates within a single scheme for the given `query` — the
/// already-extracted name fragment, without any trigger prefix. Matches names in
/// `scheme_id` that start with `query`, preserving table order.
///
/// When `include_ascii` is `false`, symbols whose character is ASCII are skipped.
pub fn complete_in<'a>(
    scheme_id: &'a str,
    query: &'a str,
    include_ascii: bool,
) -> impl Iterator<Item = &'static Symbol> + 'a {
    symbols().iter().filter(move |s| {
        s.scheme == scheme_id && (include_ascii || !s.is_ascii()) && s.name.starts_with(query)
    })
}

/// The set of characters appearing in the names of `scheme_id`.
///
/// For operator-triggered schemes this is the alphabet an editor integration uses
/// to find the token under the cursor (e.g. `=`, `>`, `-`).
pub fn name_chars(scheme_id: &str) -> BTreeSet<char> {
    symbols()
        .iter()
        .filter(|s| s.scheme == scheme_id)
        .flat_map(|s| s.name.chars())
        .collect()
}

/// Parse a single `\UnicodeMathSymbol{"HEX}{\macro}{\class}{description}%` line
/// into a `unicode-math` [`Symbol`]. Returns `None` for comments, blank lines,
/// and anything that does not match the expected shape.
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
        scheme: scheme::UNICODE_MATH,
        name,
        ch,
        class: Some(class),
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

    fn find(scheme_id: &str, name: &str) -> &'static Symbol {
        symbols()
            .iter()
            .find(|s| s.scheme == scheme_id && s.name == name)
            .unwrap_or_else(|| panic!("expected symbol `{scheme_id}:{name}` to exist"))
    }

    #[test]
    fn parses_every_macro_line() {
        let macro_lines = TABLE
            .lines()
            .filter(|l| l.starts_with("\\UnicodeMathSymbol"))
            .count();
        let parsed = symbols()
            .iter()
            .filter(|s| s.scheme == scheme::UNICODE_MATH)
            .count();
        assert_eq!(parsed, macro_lines);
    }

    #[test]
    fn unicode_math_snapshot_count() {
        // Tracks the vendored table; bump intentionally on update.
        let count = symbols()
            .iter()
            .filter(|s| s.scheme == scheme::UNICODE_MATH)
            .count();
        assert_eq!(count, 2448);
    }

    #[test]
    fn known_unicode_math_symbols() {
        let leq = find(scheme::UNICODE_MATH, "leq");
        assert_eq!(leq.ch, '≤');
        assert_eq!(leq.codepoint(), 0x2264);
        assert_eq!(leq.usv(), "U+2264");
        assert_eq!(leq.class, Some("mathrel"));

        assert_eq!(find(scheme::UNICODE_MATH, "lparen").ch, '(');
        assert_eq!(find(scheme::UNICODE_MATH, "BbbR").ch, 'ℝ');
        assert_eq!(find(scheme::UNICODE_MATH, "mupalpha").ch, 'α');
    }

    #[test]
    fn ascii_aliases_present() {
        let arrow = find(scheme::ASCII, "=>");
        assert_eq!(arrow.ch, '⇒');
        assert_eq!(arrow.class, None);
        assert_eq!(find(scheme::ASCII, "->").ch, '→');
    }

    #[test]
    fn names_are_trimmed_and_nonempty() {
        assert!(symbols().iter().all(|s| s.name == s.name.trim()));
        assert!(symbols().iter().all(|s| !s.name.is_empty()));
    }

    #[test]
    fn complete_in_filters_by_scheme_and_prefix() {
        let names: Vec<_> = complete_in(scheme::UNICODE_MATH, "leq", false)
            .map(|s| s.name)
            .collect();
        assert!(names.contains(&"leq"));
        assert!(names.iter().all(|n| n.starts_with("leq")));
        assert!(complete_in(scheme::UNICODE_MATH, "leq", false)
            .all(|s| s.scheme == scheme::UNICODE_MATH));
    }

    #[test]
    fn complete_in_excludes_ascii_targets_by_default() {
        // \lparen -> '(' is an ASCII *target*: hidden by default, shown on request.
        assert!(!complete_in(scheme::UNICODE_MATH, "lparen", false).any(|s| s.name == "lparen"));
        assert!(complete_in(scheme::UNICODE_MATH, "lparen", true).any(|s| s.name == "lparen"));
    }

    #[test]
    fn ascii_name_chars() {
        let chars = name_chars(scheme::ASCII);
        assert!(chars.contains(&'='));
        assert!(chars.contains(&'>'));
        assert!(chars.contains(&'|'));
        assert!(!chars.contains(&'a'));
    }
}
