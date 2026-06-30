//! Unicode (math) symbol database for unikodo.
//!
//! The data is sourced from the [`unicode-math`] package's
//! `unicode-math-table.tex`, vendored under `data/` and embedded into the binary
//! at compile time. Each entry maps a `unicode-math` macro to a Unicode
//! character, a math class, and a human-readable description.
//!
//! See `data/README.md` for provenance and licensing of the embedded table.
//!
//! [`unicode-math`]: https://github.com/wspr/unicode-math
//!
//! # Example
//!
//! ```
//! let leq = unikodo_core::symbols()
//!     .iter()
//!     .find(|s| s.name == "leq")
//!     .unwrap();
//! assert_eq!(leq.ch, '≤');
//! assert_eq!(leq.class, "mathrel");
//! ```

mod db;
mod symbol;

pub use db::{complete, symbols};
pub use symbol::Symbol;
