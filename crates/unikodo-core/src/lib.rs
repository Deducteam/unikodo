//! Unicode symbol database for unikodo.
//!
//! unikodo exposes symbols through one or more *naming schemes* (see
//! [`mod@scheme`]): `unicode-math` macros, ASCII digraphs, Typst `sym` names,
//! and — by design — more in future. Every [`Symbol`] is tagged with the scheme
//! it came from, so callers can enable any subset and match within each scheme
//! independently.
//!
//! Data sources: `unicode-math`'s `unicode-math-table.tex` (vendored under
//! `data/`, embedded at compile time; see `data/README.md`) and the
//! [`codex`](https://docs.rs/codex) crate for Typst's `sym` names.
//!
//! # Example
//!
//! ```
//! use unikodo_core::{complete_in, TYPST, UNICODE_MATH};
//!
//! let leq = complete_in(UNICODE_MATH, "leq", false)
//!     .find(|s| s.name == "leq")
//!     .unwrap();
//! assert_eq!(leq.value, "≤");
//! assert_eq!(leq.class, Some("mathrel"));
//!
//! // Typst names are dotted; the same character is `lt.eq`.
//! let lteq = complete_in(TYPST, "lt.eq", false).next().unwrap();
//! assert_eq!(lteq.value, "≤");
//! ```

mod db;
mod scheme;
mod symbol;

pub use db::{complete_in, name_chars, symbols};
pub use scheme::{scheme, schemes, SchemeInfo, ASCII, LATEX, TYPST, UNICODE, UNICODE_MATH};
pub use symbol::Symbol;
