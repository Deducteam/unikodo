//! unikodo LSP server: Unicode symbol completions across multiple naming schemes.
//!
//! Each enabled [naming scheme](unikodo_core::scheme) contributes completions:
//! `unicode-math` macros (`\leq` → `≤`), Typst `sym` names (`\arrow.r.double` →
//! `⇒`), and ASCII digraphs typed inline (`=>` → `⇒`). Accepting a completion
//! replaces the typed name with the Unicode character. Which schemes are active —
//! and, for prefix schemes, which prefix triggers them — is configurable (see
//! [`Config`]).

use std::collections::{BTreeMap, BTreeSet};
use std::sync::RwLock;

use dashmap::DashMap;
use serde::Deserialize;
use serde_json::Value;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};
use unikodo_core::{complete_in, name_chars, scheme, schemes, Symbol, Trigger, UNICODE_MATH};

/// User-configurable settings, supplied via `initializationOptions` at startup or
/// `workspace/didChangeConfiguration` later (optionally nested under a `unikodo`
/// key).
#[derive(Debug, Clone, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Config {
    /// Scheme ids to offer completions from, e.g. `["unicode-math", "typst"]`.
    enabled_schemes: Vec<String>,
    /// Whether to also offer names whose value is a single ASCII character.
    include_ascii: bool,
    /// Per-scheme prefix overrides (scheme id → prefix), for prefix-triggered
    /// schemes. Defaults to each scheme's built-in prefix when absent.
    prefixes: BTreeMap<String, String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            enabled_schemes: vec![UNICODE_MATH.to_string()],
            include_ascii: false,
            prefixes: BTreeMap::new(),
        }
    }
}

impl Config {
    /// The effective prefix for a prefix-triggered scheme: the user's override if
    /// present, otherwise the scheme's default.
    fn prefix<'a>(&'a self, scheme_id: &str, default: &'a str) -> &'a str {
        self.prefixes
            .get(scheme_id)
            .map(String::as_str)
            .unwrap_or(default)
    }
}

/// Extract a [`Config`] from a settings value, tolerating a `unikodo` wrapper key
/// and ignoring anything that does not deserialize.
fn parse_config(value: Option<&Value>) -> Option<Config> {
    let value = value?;
    let section = value.get("unikodo").unwrap_or(value);
    serde_json::from_value(section.clone()).ok()
}

struct Backend {
    client: Client,
    /// Full text of each open document, kept current via `FULL` text sync.
    documents: DashMap<Url, String>,
    config: RwLock<Config>,
}

impl Backend {
    fn apply_config(&self, value: Option<&Value>) {
        if let Some(config) = parse_config(value) {
            *self.config.write().unwrap() = config;
        }
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        self.apply_config(params.initialization_options.as_ref());
        let triggers = trigger_characters(&self.config.read().unwrap());

        Ok(InitializeResult {
            server_info: Some(ServerInfo {
                name: "unikodo".to_string(),
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
            }),
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(triggers),
                    resolve_provider: Some(false),
                    ..Default::default()
                }),
                ..Default::default()
            },
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "unikodo language server initialized")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_change_configuration(&self, params: DidChangeConfigurationParams) {
        self.apply_config(Some(&params.settings));
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        self.documents
            .insert(params.text_document.uri, params.text_document.text);
    }

    async fn did_change(&self, mut params: DidChangeTextDocumentParams) {
        if let Some(change) = params.content_changes.pop() {
            self.documents.insert(params.text_document.uri, change.text);
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        self.documents.remove(&params.text_document.uri);
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = params.text_document_position.text_document.uri;
        let position = params.text_document_position.position;
        let config = self.config.read().unwrap().clone();

        let items = self
            .documents
            .get(&uri)
            .and_then(|text| completions_at(text.value(), position, &config));

        Ok(items.map(|items| {
            CompletionResponse::List(CompletionList {
                is_incomplete: false,
                items,
            })
        }))
    }
}

/// The trigger characters to advertise: the last character of each prefix scheme's
/// effective prefix, plus the alphabet of each operator scheme. Computed over all
/// built-in schemes so a scheme enabled later still triggers.
fn trigger_characters(config: &Config) -> Vec<String> {
    let mut chars: BTreeSet<char> = BTreeSet::new();
    for info in schemes() {
        match info.trigger {
            Trigger::Prefix(default) => {
                if let Some(c) = config.prefix(info.id, default).chars().last() {
                    chars.insert(c);
                }
            }
            Trigger::Operator => chars.extend(name_chars(info.id)),
        }
    }
    chars.into_iter().map(|c| c.to_string()).collect()
}

/// Build completion items for `position` within `text`, across the enabled
/// schemes, or `None` if nothing matches under the cursor.
///
/// A free function (rather than a method) so it can be unit-tested without a live
/// LSP [`Client`].
fn completions_at(text: &str, position: Position, config: &Config) -> Option<Vec<CompletionItem>> {
    let line = text.lines().nth(position.line as usize).unwrap_or_default();

    // LSP character offsets count UTF-16 code units; slice the line in those.
    let units: Vec<u16> = line.encode_utf16().collect();
    let cursor = (position.character as usize).min(units.len());
    let before_cursor = String::from_utf16_lossy(&units[..cursor]);

    let mut items = Vec::new();
    for id in &config.enabled_schemes {
        let Some(info) = scheme(id) else { continue };

        let (query, start, prefix) = match info.trigger {
            Trigger::Prefix(default) => {
                let prefix = config.prefix(info.id, default);
                let Some((query, start)) = prefix_token(&before_cursor, prefix) else {
                    continue;
                };
                (query, start, Some(prefix))
            }
            Trigger::Operator => {
                let Some((query, start)) = operator_token(&before_cursor, info.id) else {
                    continue;
                };
                (query, start, None)
            }
        };

        let range = Range::new(
            Position::new(position.line, start),
            Position::new(position.line, position.character),
        );
        items.extend(
            complete_in(info.id, query, config.include_ascii)
                .map(|symbol| completion_item(symbol, prefix, info.display, range)),
        );
    }

    (!items.is_empty()).then_some(items)
}

/// Token for a prefix-triggered scheme: the text after the last occurrence of
/// `prefix` (no whitespace between), and the UTF-16 start column of the prefix.
fn prefix_token<'a>(before_cursor: &'a str, prefix: &str) -> Option<(&'a str, u32)> {
    if prefix.is_empty() {
        return None;
    }
    let idx = before_cursor.rfind(prefix)?;
    let query = &before_cursor[idx + prefix.len()..];
    if query.contains(char::is_whitespace) {
        return None;
    }
    Some((query, utf16_col(before_cursor, idx)))
}

/// Token for an operator-triggered scheme: the maximal run of the scheme's name
/// characters ending at the cursor, and its UTF-16 start column.
fn operator_token<'a>(before_cursor: &'a str, scheme_id: &str) -> Option<(&'a str, u32)> {
    let allowed = name_chars(scheme_id);
    let start = before_cursor
        .char_indices()
        .rev()
        .take_while(|&(_, c)| allowed.contains(&c))
        .last()
        .map(|(i, _)| i)?;
    Some((&before_cursor[start..], utf16_col(before_cursor, start)))
}

/// Number of UTF-16 code units in `s` up to byte index `byte_idx`.
fn utf16_col(s: &str, byte_idx: usize) -> u32 {
    s[..byte_idx].encode_utf16().count() as u32
}

/// Turn a [`Symbol`] into a completion item whose acceptance inserts the value
/// over the typed name (`range`). `prefix` is the scheme's effective prefix for
/// prefix-triggered schemes, or `None` for operator-triggered ones.
fn completion_item(
    symbol: &Symbol,
    prefix: Option<&str>,
    scheme_display: &str,
    range: Range,
) -> CompletionItem {
    let typed = match prefix {
        Some(p) => format!("{p}{}", symbol.name),
        None => symbol.name.clone(),
    };
    let glyph = symbol.value.clone();
    let codepoints = symbol
        .value
        .chars()
        .map(|c| format!("U+{:04X}", c as u32))
        .collect::<Vec<_>>()
        .join(" ");
    let class = match symbol.class {
        Some(c) => format!(", \\{c}"),
        None => String::new(),
    };
    let detail = if symbol.description.is_empty() {
        glyph.clone()
    } else {
        format!("{glyph}  {}", symbol.description)
    };
    let desc_block = if symbol.description.is_empty() {
        String::new()
    } else {
        format!("{}\n\n", symbol.description)
    };
    let documentation = format!(
        "## {glyph}\n\n`{typed}` → `{glyph}`  ({codepoints}{class})\n\n{desc_block}*scheme: {scheme_display}*"
    );

    CompletionItem {
        label: typed.clone(),
        label_details: Some(CompletionItemLabelDetails {
            detail: Some(format!("  {glyph}")),
            description: Some(scheme_display.to_string()),
        }),
        kind: Some(CompletionItemKind::TEXT),
        detail: Some(detail),
        documentation: Some(Documentation::MarkupContent(MarkupContent {
            kind: MarkupKind::Markdown,
            value: documentation,
        })),
        filter_text: Some(typed.clone()),
        sort_text: Some(symbol.name.clone()),
        text_edit: Some(CompletionTextEdit::Edit(TextEdit {
            range,
            new_text: glyph,
        })),
        ..Default::default()
    }
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::new(|client| Backend {
        client,
        documents: DashMap::new(),
        config: RwLock::new(Config::default()),
    });

    Server::new(stdin, stdout, socket).serve(service).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pos(line: u32, character: u32) -> Position {
        Position::new(line, character)
    }

    fn cfg(schemes: &[&str]) -> Config {
        Config {
            enabled_schemes: schemes.iter().map(|s| s.to_string()).collect(),
            include_ascii: false,
            prefixes: BTreeMap::new(),
        }
    }

    fn edit(item: &CompletionItem) -> &TextEdit {
        match &item.text_edit {
            Some(CompletionTextEdit::Edit(edit)) => edit,
            _ => panic!("expected a plain text edit"),
        }
    }

    fn find<'a>(items: &'a [CompletionItem], label: &str) -> &'a CompletionItem {
        items
            .iter()
            .find(|i| i.label == label)
            .unwrap_or_else(|| panic!("missing completion `{label}`"))
    }

    #[test]
    fn unicode_math_backslash() {
        let items = completions_at("\\leq", pos(0, 4), &cfg(&["unicode-math"])).expect("items");
        let e = edit(find(&items, "\\leq"));
        assert_eq!(e.new_text, "≤");
        assert_eq!(e.range.start.character, 0);
        assert_eq!(e.range.end.character, 4);
    }

    #[test]
    fn typst_backslash_dotted() {
        let line = "\\arrow.r.double";
        let items =
            completions_at(line, pos(0, line.len() as u32), &cfg(&["typst"])).expect("items");
        let e = edit(find(&items, "\\arrow.r.double"));
        assert_eq!(e.new_text, "⇒");
        assert_eq!(e.range.start.character, 0);
        assert_eq!(e.range.end.character, line.len() as u32);
    }

    #[test]
    fn typst_partial_dotted_offers_variants() {
        let items = completions_at("\\arrow.r", pos(0, 8), &cfg(&["typst"])).expect("items");
        let labels: Vec<_> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"\\arrow.r"));
        assert!(labels.contains(&"\\arrow.r.double"));
    }

    #[test]
    fn per_scheme_prefix_override() {
        let mut c = cfg(&["typst"]);
        c.prefixes.insert("typst".to_string(), ";".to_string());
        let items = completions_at(";alpha", pos(0, 6), &c).expect("items");
        let e = edit(find(&items, ";alpha"));
        assert_eq!(e.new_text, "α");
        assert_eq!(e.range.start.character, 0);
        // Backslash should no longer trigger Typst when the prefix is ";".
        assert!(completions_at("\\alpha", pos(0, 6), &c).is_none());
    }

    #[test]
    fn ascii_operator_digraph() {
        let items = completions_at("=>", pos(0, 2), &cfg(&["ascii"])).expect("items");
        let e = edit(find(&items, "=>"));
        assert_eq!(e.new_text, "⇒");
        assert_eq!(e.range.start.character, 0);
        assert_eq!(e.range.end.character, 2);
    }

    #[test]
    fn operator_run_stops_at_non_operator() {
        let items = completions_at("2=>", pos(0, 3), &cfg(&["ascii"])).expect("items");
        let e = edit(find(&items, "=>"));
        assert_eq!(e.range.start.character, 1);
        assert_eq!(e.range.end.character, 3);
    }

    #[test]
    fn disabled_scheme_yields_nothing() {
        assert!(completions_at("=>", pos(0, 2), &cfg(&["unicode-math"])).is_none());
        assert!(completions_at("\\leq", pos(0, 4), &cfg(&["ascii"])).is_none());
    }

    #[test]
    fn both_prefix_schemes_share_backslash() {
        let c = cfg(&["unicode-math", "typst"]);
        // unicode-math `\in` and Typst `\in` both available under the same prefix.
        let items = completions_at("\\in", pos(0, 3), &c).expect("items");
        assert!(items.iter().any(|i| i.label == "\\in"
            && i.label_details
                .as_ref()
                .and_then(|d| d.description.as_deref())
                == Some("Typst")));
        assert!(items.iter().any(|i| i.label == "\\in"
            && i.label_details
                .as_ref()
                .and_then(|d| d.description.as_deref())
                == Some("unicode-math")));
    }

    #[test]
    fn no_backslash_no_completion() {
        assert!(completions_at("leq", pos(0, 3), &cfg(&["unicode-math"])).is_none());
    }

    #[test]
    fn respects_utf16_offsets() {
        // '𝕏' (U+1D54F) is two UTF-16 code units; the start column must reflect it.
        let line = "𝕏\\leq";
        let cursor = line.encode_utf16().count() as u32; // 2 + 1 + 3 = 6
        let items = completions_at(line, pos(0, cursor), &cfg(&["unicode-math"])).expect("items");
        let e = edit(find(&items, "\\leq"));
        assert_eq!(e.range.start.character, 2);
        assert_eq!(e.range.end.character, 6);
    }

    #[test]
    fn config_parses_prefixes() {
        let v = serde_json::json!({
            "enabledSchemes": ["unicode-math", "typst"],
            "includeAscii": true,
            "prefixes": { "typst": ";" }
        });
        let c = parse_config(Some(&v)).unwrap();
        assert_eq!(c.enabled_schemes, vec!["unicode-math", "typst"]);
        assert!(c.include_ascii);
        assert_eq!(c.prefix("typst", "\\"), ";");
        assert_eq!(c.prefix("unicode-math", "\\"), "\\"); // default kept
    }

    #[test]
    fn config_parses_under_unikodo_key() {
        let v = serde_json::json!({"unikodo": {"enabledSchemes": ["typst"]}});
        let c = parse_config(Some(&v)).unwrap();
        assert_eq!(c.enabled_schemes, vec!["typst"]);
        assert!(!c.include_ascii);
    }
}
