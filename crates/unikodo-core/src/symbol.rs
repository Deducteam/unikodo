/// A single Unicode symbol exposed by some naming [scheme](crate::scheme): a
/// `name` within that scheme that expands to a `value` (the text inserted when
/// the completion is accepted).
///
/// `value` is usually a single character, but occasionally a base character plus
/// a Unicode variation selector (e.g. Typst's `arrow.l.r` = `↔︎`), so it is a
/// string rather than a `char`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Symbol {
    /// Id of the scheme this name belongs to, e.g. `"unicode-math"`, `"ascii"`,
    /// or `"typst"`.
    pub scheme: &'static str,
    /// Name within the scheme, *without* any trigger prefix. For `unicode-math`
    /// this is the macro minus its backslash (`"leq"`); for `ascii` the literal
    /// digraph (`"=>"`); for `typst` the dotted name (`"arrow.r.double"`).
    pub name: String,
    /// The text inserted when this symbol is accepted.
    pub value: String,
    /// `unicode-math` math class without the leading backslash (e.g. `"mathrel"`),
    /// when the scheme provides one.
    pub class: Option<&'static str>,
    /// Human-readable description, or `""` if the scheme provides none.
    pub description: &'static str,
}

impl Symbol {
    /// The single Unicode scalar value, if `value` is exactly one character.
    /// `None` for multi-character values (e.g. a character + variation selector).
    pub fn single_char(&self) -> Option<char> {
        let mut chars = self.value.chars();
        match (chars.next(), chars.next()) {
            (Some(c), None) => Some(c),
            _ => None,
        }
    }

    /// The code point of [`Symbol::single_char`], if any.
    pub fn codepoint(&self) -> Option<u32> {
        self.single_char().map(|c| c as u32)
    }

    /// `U+XXXX` formatting of the code point, if `value` is a single character.
    pub fn usv(&self) -> Option<String> {
        self.codepoint().map(|cp| format!("U+{cp:04X}"))
    }

    /// Whether `value` is a single character in the ASCII range (`< U+0080`).
    ///
    /// unikodo's completions target *non-ASCII* characters by default; a name
    /// that expands to an ASCII character is rarely worth a completion.
    /// Multi-character values (e.g. with a variation selector) are not ASCII.
    pub fn is_ascii(&self) -> bool {
        self.single_char().is_some_and(|c| (c as u32) < 0x80)
    }
}
