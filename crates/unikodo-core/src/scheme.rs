//! Naming schemes: the different vocabularies a user can type to insert a symbol.
//!
//! unikodo is designed around *multiple* naming schemes. Most are tables of
//! `name → character` (`unicode-math`, `latex`, `typst`, `ascii`); `unicode` is a
//! dynamic scheme that turns a hex code point into its character. Each scheme has
//! a **default trigger** — the text typed before a name (e.g. `\` or `U+`) — which
//! an editor integration may override per scheme. An empty trigger means *no
//! trigger*: the bare name is matched inline as it is typed.
//!
//! [`Symbol`]: crate::Symbol

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
    /// The default trigger typed before a name (e.g. `"\\"`, `"U+"`). An empty
    /// string means *no trigger* — the bare name is matched inline. Editor
    /// integrations may override this per scheme.
    pub default_trigger: &'static str,
}

/// `unicode-math` macro names without the backslash, e.g. `leq`, `mupalpha`.
pub const UNICODE_MATH: &str = "unicode-math";
/// Conventional LaTeX + AMS macro names, e.g. `alpha`, `leq`, `subseteq`.
pub const LATEX: &str = "latex";
/// Typst `sym` names, e.g. `arrow.r.double`, `alpha`, `eq.not`.
pub const TYPST: &str = "typst";
/// Unicode code points entered by hex, e.g. `U+03B1`. A dynamic scheme (no table).
pub const UNICODE: &str = "unicode";
/// ASCII digraphs, e.g. `=>`, `->`, `<=`.
pub const ASCII: &str = "ascii";

const SCHEMES: &[SchemeInfo] = &[
    SchemeInfo {
        id: UNICODE_MATH,
        display: "unicode-math",
        description: "LaTeX unicode-math macros (e.g. \\BbbR).",
        default_trigger: "\\",
    },
    SchemeInfo {
        id: LATEX,
        display: "LaTeX",
        description: "Conventional LaTeX + AMS macros (e.g. \\alpha, \\leq).",
        default_trigger: "\\",
    },
    SchemeInfo {
        id: TYPST,
        display: "Typst",
        description: "Typst sym names (e.g. \\arrow.r.double).",
        default_trigger: "\\",
    },
    SchemeInfo {
        id: UNICODE,
        display: "Unicode",
        description: "Unicode code points by hex (e.g. U+03B1).",
        default_trigger: "U+",
    },
    SchemeInfo {
        id: ASCII,
        display: "ASCII aliases",
        description: "ASCII digraphs matched inline (e.g. => for ⇒, -> for →).",
        default_trigger: "",
    },
];

/// All built-in schemes.
pub fn schemes() -> &'static [SchemeInfo] {
    SCHEMES
}

/// Look up a built-in scheme by id.
pub fn scheme(id: &str) -> Option<&'static SchemeInfo> {
    SCHEMES.iter().find(|s| s.id == id)
}
