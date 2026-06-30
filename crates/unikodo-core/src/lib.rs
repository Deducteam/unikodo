//! Unicode symbol database for unikodo.
//!
//! unikodo exposes symbols through one or more *naming schemes* (see
//! [`mod@scheme`]): `unicode-math` macros, ASCII digraphs, and — by design —
//! more in future. Every [`Symbol`] is tagged with the scheme it came from, so
//! callers can enable any subset and match within each scheme independently.
//!
//! The `unicode-math` data is sourced from that package's
//! `unicode-math-table.tex`, vendored under `data/` and embedded at compile time
//! (see `data/README.md` for provenance and licensing).
//!
//! # Example
//!
//! ```
//! use unikodo_core::{complete_in, UNICODE_MATH};
//!
//! let leq = complete_in(UNICODE_MATH, "leq", false)
//!     .find(|s| s.name == "leq")
//!     .unwrap();
//! assert_eq!(leq.ch, '≤');
//! assert_eq!(leq.class, Some("mathrel"));
//! ```

mod db;
mod scheme;
mod symbol;

pub use db::{complete_in, name_chars, symbols};
pub use scheme::{scheme, schemes, SchemeInfo, Trigger, ASCII, UNICODE_MATH};
pub use symbol::Symbol;
