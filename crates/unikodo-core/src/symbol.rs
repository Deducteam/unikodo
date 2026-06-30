/// A single Unicode symbol together with its `unicode-math` macro name, math
/// class, and human-readable description.
///
/// All string fields borrow from the table embedded at compile time, so a
/// `Symbol` is cheap to copy and lives for the whole program (`'static`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Symbol {
    /// Macro name *without* the leading backslash, e.g. `"lparen"`.
    pub name: &'static str,
    /// The Unicode character this macro expands to.
    pub ch: char,
    /// The `unicode-math` math class without the leading backslash, e.g.
    /// `"mathopen"`, `"mathrel"`, or `"mathalpha"`.
    pub class: &'static str,
    /// Human-readable description, e.g. `"left parenthesis"`.
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
    /// macro that expands to an ASCII character (e.g. `\lparen` → `(`) is rarely
    /// worth a completion.
    #[inline]
    pub const fn is_ascii(&self) -> bool {
        self.codepoint() < 0x80
    }
}
