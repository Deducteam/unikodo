/// A single Unicode symbol exposed by some naming [scheme](crate::scheme): a
/// `name` within that scheme that expands to a Unicode character `ch`.
///
/// All string fields borrow from data embedded at compile time, so a `Symbol` is
/// cheap to copy and lives for the whole program (`'static`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Symbol {
    /// Id of the scheme this name belongs to, e.g. `"unicode-math"` or `"ascii"`.
    pub scheme: &'static str,
    /// Name within the scheme, *without* any trigger prefix. For `unicode-math`
    /// this is the macro minus its backslash (`"leq"`); for `ascii` it is the
    /// literal digraph (`"=>"`).
    pub name: &'static str,
    /// The Unicode character this name expands to.
    pub ch: char,
    /// `unicode-math` math class without the leading backslash (e.g. `"mathrel"`),
    /// when the scheme provides one.
    pub class: Option<&'static str>,
    /// Human-readable description, e.g. `"less-than or equal to"`.
    pub description: &'static str,
}

impl Symbol {
    /// The Unicode scalar value (code point) of [`Symbol::ch`].
    #[inline]
    pub const fn codepoint(&self) -> u32 {
        self.ch as u32
    }

    /// `U+XXXX` formatting of the code point, e.g. `"U+2264"`.
    pub fn usv(&self) -> String {
        format!("U+{:04X}", self.codepoint())
    }

    /// Whether the character is in the ASCII range (`< U+0080`).
    ///
    /// unikodo's completions target *non-ASCII* characters by default, since a
    /// name that expands to an ASCII character is rarely worth a completion.
    #[inline]
    pub const fn is_ascii(&self) -> bool {
        self.codepoint() < 0x80
    }
}
