//! Naming schemes: the different vocabularies a user can type to insert a symbol.
//!
//! unikodo is designed around *multiple* naming schemes. `unicode-math` macros
//! are one; ASCII digraphs (`=>` → `⇒`) are another; Typst's `sym` names
//! (`arrow.r.double` → `⇒`) are a third. Each scheme has its own data (tagged
//! onto every [`Symbol`]) and a [`Trigger`] describing how its names are typed,
//! which editor integrations use to decide when to offer completions and what
//! text to replace.
//!
//! [`Symbol`]: crate::Symbol

/// How a scheme's names are typed at the cursor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    /// Names follow a leading prefix string — e.g. `\leq` has prefix `"\\"`.
    /// This is the scheme's *default*; an editor integration may let the user
    /// override it per scheme.
    Prefix(&'static str),
    /// Names are runs of punctuation typed inline — e.g. `=>` — with no leading
    /// trigger.
    Operator,
}

/// Metadata describing a naming scheme.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SchemeInfo {
    /// Stable identifier, used in configuration and on every [`Symbol`].
    ///
    /// [`Symbol`]: crate::Symbol
    pub id: &'static str,
    /// Human-readable name.
    pub display: &'static str,
    /// One-line description.
    pub description: &'static str,
    /// How this scheme's names are typed (the default trigger).
    pub trigger: Trigger,
}

/// `unicode-math` macro names without the backslash, e.g. `leq`, `mupalpha`.
pub const UNICODE_MATH: &str = "unicode-math";
/// ASCII digraphs, e.g. `=>`, `->`, `<=`.
pub const ASCII: &str = "ascii";
/// Typst `sym` names, e.g. `arrow.r.double`, `alpha`, `eq.not`.
pub const TYPST: &str = "typst";

const SCHEMES: &[SchemeInfo] = &[
    SchemeInfo {
        id: UNICODE_MATH,
        display: "unicode-math",
        description: "LaTeX unicode-math macros, typed after a backslash (e.g. \\leq).",
        trigger: Trigger::Prefix("\\"),
    },
    SchemeInfo {
        id: TYPST,
        display: "Typst",
        description: "Typst sym names, typed after a backslash (e.g. \\arrow.r.double).",
        trigger: Trigger::Prefix("\\"),
    },
    SchemeInfo {
        id: ASCII,
        display: "ASCII aliases",
        description: "ASCII digraphs typed inline (e.g. => for ⇒, -> for →).",
        trigger: Trigger::Operator,
    },
];

/// All built-in schemes that currently have data.
pub fn schemes() -> &'static [SchemeInfo] {
    SCHEMES
}

/// Look up a built-in scheme by id.
pub fn scheme(id: &str) -> Option<&'static SchemeInfo> {
    SCHEMES.iter().find(|s| s.id == id)
}
