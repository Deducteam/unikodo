//! Dump every built-in symbol (across all naming schemes) plus the scheme
//! metadata as a single JSON document, for consumption by the web frontend
//! (`web/`). This keeps the website's dataset sourced from the same in-memory
//! database the LSP serves, rather than re-parsing the vendored tables in JS.
//!
//! ```sh
//! cargo run -p unikodo-core --example dump_json > web/src/data/symbols.json
//! ```

use serde_json::{json, Value};

use unikodo_core::{schemes, symbols};

fn main() {
    let schemes: Vec<Value> = schemes()
        .iter()
        .map(|s| {
            json!({
                "id": s.id,
                "display": s.display,
                "description": s.description,
                "defaultTrigger": s.default_trigger,
            })
        })
        .collect();

    let symbols: Vec<Value> = symbols()
        .iter()
        .map(|s| {
            json!({
                "scheme": s.scheme,
                "name": s.name,
                "value": s.value,
                "class": s.class,
                "description": s.description,
                "codepoint": s.codepoint(),
                "usv": s.usv(),
                "ascii": s.is_ascii(),
            })
        })
        .collect();

    let doc = json!({
        "schemes": schemes,
        "symbols": symbols,
    });

    println!("{}", serde_json::to_string(&doc).expect("serialize symbol DB"));
}
