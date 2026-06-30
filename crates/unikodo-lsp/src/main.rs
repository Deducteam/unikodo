//! unikodo LSP server: Unicode symbol completions across multiple naming schemes.
//!
//! Each enabled [naming scheme](unikodo_core::scheme) contributes completions:
//! `unicode-math` macros after a backslash (`\leq` → `≤`), ASCII digraphs typed
//! inline (`=>` → `⇒`), and more in future. Accepting a completion replaces the
//! typed name with the Unicode character. Which schemes are active is
//! configurable (see [`Config`]).

use std::collections::BTreeSet;
use std::sync::RwLock;

use dashmap::DashMap;
use serde::Deserialize;
use serde_json::Value;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};
use unikodo_core::{
    complete_in, name_chars, scheme, schemes, SchemeInfo, Symbol, Trigger, UNICODE_MATH,
};

/// User-configurable settings, supplied via `initializationOptions` at startup or
/// `workspace/didChangeConfiguration` later (optionally nested under a `unikodo`
/// key).
#[derive(Debug, Clone, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Config {
    /// Scheme ids to offer completions from, e.g. `["unicode-math", "ascii"]`.
    enabled_schemes: Vec<String>,
    /// Whether to also offer names whose target character is ASCII.
    include_ascii: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            // ASCII digraphs are opt-in: enabling them registers many trigger
            // characters (`=`, `>`, `-`, …), which is surprising by default.
            enabled_schemes: vec![UNICODE_MATH.to_string()],
            include_ascii: false,
        }
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
                    // Register triggers for every built-in scheme so toggling a
                    // scheme on at runtime works without a restart.
                    trigger_characters: Some(trigger_characters()),
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

/// The union of every built-in scheme's trigger characters: prefix characters
/// (e.g. `\`) plus the alphabet of each operator scheme (e.g. `=`, `>`, `-`).
fn trigger_characters() -> Vec<String> {
    let mut chars: BTreeSet<char> = BTreeSet::new();
    for info in schemes() {
        match info.trigger {
            Trigger::Prefix(c) => {
                chars.insert(c);
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
        let Some((query, start)) = token_for(&before_cursor, info) else {
            continue;
        };
        let range = Range::new(
            Position::new(position.line, start),
            Position::new(position.line, position.character),
        );
        items.extend(
            complete_in(info.id, query, config.include_ascii)
                .map(|symbol| completion_item(symbol, info, range)),
        );
    }

    if items.is_empty() {
        None
    } else {
        Some(items)
    }
}

/// Find the token under the cursor for `info`'s trigger, returning the query (the
/// name fragment to match) and the UTF-16 start column of the text it replaces.
fn token_for<'a>(before_cursor: &'a str, info: &SchemeInfo) -> Option<(&'a str, u32)> {
    match info.trigger {
        Trigger::Prefix(prefix) => {
            let idx = before_cursor.rfind(prefix)?;
            let query = &before_cursor[idx + prefix.len_utf8()..];
            if query.contains(char::is_whitespace) {
                return None;
            }
            Some((query, utf16_col(before_cursor, idx)))
        }
        Trigger::Operator => {
            let allowed = name_chars(info.id);
            // The maximal run of allowed characters ending at the cursor.
            let start = before_cursor
                .char_indices()
                .rev()
                .take_while(|&(_, c)| allowed.contains(&c))
                .last()
                .map(|(i, _)| i)?;
            Some((&before_cursor[start..], utf16_col(before_cursor, start)))
        }
    }
}

/// Number of UTF-16 code units in `s` up to byte index `byte_idx`.
fn utf16_col(s: &str, byte_idx: usize) -> u32 {
    s[..byte_idx].encode_utf16().count() as u32
}

/// Turn a [`Symbol`] into a completion item whose acceptance inserts the
/// character over the typed name (`range`).
fn completion_item(symbol: &Symbol, info: &SchemeInfo, range: Range) -> CompletionItem {
    let typed = match info.trigger {
        Trigger::Prefix(c) => format!("{c}{}", symbol.name),
        Trigger::Operator => symbol.name.to_string(),
    };
    let character = symbol.ch.to_string();
    let class = match symbol.class {
        Some(c) => format!(", \\{c}"),
        None => String::new(),
    };

    CompletionItem {
        label: typed.clone(),
        label_details: Some(CompletionItemLabelDetails {
            detail: Some(format!("  {character}")),
            description: Some(info.display.to_string()),
        }),
        kind: Some(CompletionItemKind::TEXT),
        detail: Some(format!("{character}  {}", symbol.description)),
        documentation: Some(Documentation::MarkupContent(MarkupContent {
            kind: MarkupKind::Markdown,
            value: format!(
                "## {character}\n\n`{typed}` → `{character}`  ({usv}{class})\n\n{desc}\n\n*scheme: {scheme}*",
                usv = symbol.usv(),
                desc = symbol.description,
                scheme = info.display,
            ),
        })),
        filter_text: Some(typed),
        sort_text: Some(symbol.name.to_string()),
        text_edit: Some(CompletionTextEdit::Edit(TextEdit {
            range,
            new_text: character,
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
    fn ascii_operator_digraph() {
        let items = completions_at("=>", pos(0, 2), &cfg(&["ascii"])).expect("items");
        let e = edit(find(&items, "=>"));
        assert_eq!(e.new_text, "⇒");
        assert_eq!(e.range.start.character, 0);
        assert_eq!(e.range.end.character, 2);
    }

    #[test]
    fn ascii_partial_operator_offers_prefix_matches() {
        // Typing just "<" should offer "<-", "<->", "<=", "<=>".
        let items = completions_at("<", pos(0, 1), &cfg(&["ascii"])).expect("items");
        let labels: Vec<_> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"<-"));
        assert!(labels.contains(&"<="));
    }

    #[test]
    fn operator_run_stops_at_non_operator() {
        // "2=>" — the leading digit must not be part of the replaced range.
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
    fn both_schemes_enabled() {
        let c = cfg(&["unicode-math", "ascii"]);
        assert!(completions_at("\\leq", pos(0, 4), &c).is_some());
        assert!(completions_at("->", pos(0, 2), &c).is_some());
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
    fn config_parses_from_initialization_options() {
        let v = serde_json::json!({"enabledSchemes": ["ascii"], "includeAscii": true});
        let c = parse_config(Some(&v)).unwrap();
        assert_eq!(c.enabled_schemes, vec!["ascii".to_string()]);
        assert!(c.include_ascii);
    }

    #[test]
    fn config_parses_under_unikodo_key() {
        let v = serde_json::json!({"unikodo": {"enabledSchemes": ["unicode-math", "ascii"]}});
        let c = parse_config(Some(&v)).unwrap();
        assert_eq!(c.enabled_schemes.len(), 2);
        assert!(!c.include_ascii); // default preserved for omitted field
    }
}
