//! unikodo LSP server: Unicode symbol completions across multiple naming schemes.
//!
//! Each enabled [naming scheme](unikodo_core::scheme) contributes completions —
//! `unicode-math`, `latex`, and `typst` names typed after a trigger (`\leq` → `≤`,
//! `\arrow.r.double` → `⇒`), `unicode` code points (`U+03B1` → `α`), and `ascii`
//! digraphs matched inline (`=>` → `⇒`). Accepting one replaces the typed name
//! with the character. Each scheme's trigger (or whether it has one at all), which
//! schemes are active, and whether duplicates are collapsed are configurable (see
//! [`Config`]).

use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::sync::{PoisonError, RwLock};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};
use unikodo_core::{complete_in, name_chars, scheme, Symbol, UNICODE, UNICODE_MATH};

/// User-configurable settings, supplied via `initializationOptions` at startup or
/// `workspace/didChangeConfiguration` later (optionally nested under a `unikodo`
/// key).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct Config {
    /// Scheme ids to offer completions from, e.g. `["unicode-math", "latex"]`.
    enabled_schemes: Vec<String>,
    /// Whether to also offer names whose value is a single ASCII character.
    include_ascii: bool,
    /// Per-scheme trigger overrides (scheme id → trigger). An empty string means
    /// *no trigger* (match the bare name inline); absent means the scheme default.
    triggers: BTreeMap<String, String>,
    /// Collapse completions that are identical (same typed name + same inserted
    /// text) across enabled schemes, keeping the first by `enabled_schemes` order.
    dedupe: bool,
    /// Whether the client takes snippets, so that a pair's completion can put
    /// the cursor between its halves. The client's capability, not a setting.
    #[serde(skip)]
    snippets: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            enabled_schemes: vec![UNICODE_MATH.to_string()],
            include_ascii: false,
            triggers: BTreeMap::new(),
            dedupe: true,
            snippets: false,
        }
    }
}

impl Config {
    /// The effective trigger for a scheme: the user's override if present,
    /// otherwise `default`. May be empty (no trigger).
    fn trigger<'a>(&'a self, scheme_id: &str, default: &'a str) -> &'a str {
        self.triggers
            .get(scheme_id)
            .map(String::as_str)
            .unwrap_or(default)
    }
}

/// Merge a settings value onto `base`, tolerating a `unikodo` wrapper key.
///
/// Only the keys present in `value` are overwritten — so a client that sends a
/// partial `workspace/didChangeConfiguration` delta (e.g. just `triggers`) does
/// not reset every other setting to its default.
fn merged_config(base: &Config, value: &Value) -> Config {
    let section = value.get("unikodo").unwrap_or(value);
    let Some(overlay) = section.as_object() else {
        return base.clone();
    };
    let mut merged = match serde_json::to_value(base) {
        Ok(Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    };
    for (key, val) in overlay {
        merged.insert(key.clone(), val.clone());
    }
    let mut config: Config =
        serde_json::from_value(Value::Object(merged)).unwrap_or_else(|_| base.clone());
    config.snippets = base.snippets;
    config
}

struct Backend {
    client: Client,
    /// Full text of each open document, kept current via `FULL` text sync.
    documents: DashMap<Url, String>,
    config: RwLock<Config>,
}

impl Backend {
    /// Merge a settings value onto the current config (see [`merged_config`]).
    fn apply_config(&self, value: Option<&Value>) {
        let Some(value) = value else { return };
        let current = self.config();
        let merged = merged_config(&current, value);
        *self.config.write().unwrap_or_else(PoisonError::into_inner) = merged;
    }

    /// A snapshot of the current config (lock-poison tolerant).
    fn config(&self) -> Config {
        self.config
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        let snippets = params
            .capabilities
            .text_document
            .as_ref()
            .and_then(|t| t.completion.as_ref())
            .and_then(|c| c.completion_item.as_ref())
            .and_then(|i| i.snippet_support)
            .unwrap_or(false);
        self.config
            .write()
            .unwrap_or_else(PoisonError::into_inner)
            .snippets = snippets;
        self.apply_config(params.initialization_options.as_ref());
        let triggers = trigger_characters(&self.config());

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
                    resolve_provider: Some(true),
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
        // tower-lsp's serve loop only returns on stdin EOF, so a client that
        // sends `exit` without closing our stdin would leave the process
        // behind. Shutdown is always teardown: give the response (and the
        // client's follow-up `exit`) a moment to settle, then exit ourselves.
        tokio::spawn(async {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            std::process::exit(0);
        });
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
        let config = self.config();

        let items = self
            .documents
            .get(&uri)
            .and_then(|text| completions_at(text.value(), position, &config));

        Ok(items.map(|items| {
            CompletionResponse::List(CompletionList {
                // The list is filtered against the typed name, so it is only
                // valid for this exact prefix. Saying `false` here invites the
                // client to cache the bare-trigger list (every name in the
                // scheme) and fuzzy-filter it itself, which reorders exact
                // matches behind camel-hump ones (`\nLeftrightarrow` ahead of
                // `\leftrightarrow`). `true` makes it re-request per keystroke.
                is_incomplete: true,
                items,
            })
        }))
    }

    /// Fill in an item's Markdown `documentation` on demand. Only the item the
    /// user highlights is resolved, so the completion response itself stays cheap
    /// even when a bare trigger matches thousands of names.
    async fn completion_resolve(&self, mut item: CompletionItem) -> Result<CompletionItem> {
        if item.documentation.is_none() {
            if let Some(value) = item.data.as_ref().and_then(build_documentation) {
                item.documentation = Some(Documentation::MarkupContent(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value,
                }));
            }
        }
        Ok(item)
    }
}

/// The trigger characters to advertise: for each *enabled* scheme, the last
/// character of its effective trigger, or its whole name alphabet when it has no
/// trigger. Restricting to enabled schemes avoids firing completion requests on
/// characters (e.g. the ASCII digraph alphabet `+ - = . |`) that can only ever
/// return nothing under the current config.
fn trigger_characters(config: &Config) -> Vec<String> {
    let mut chars: BTreeSet<char> = BTreeSet::new();
    for id in &config.enabled_schemes {
        let Some(info) = scheme(id) else { continue };
        let trigger = config.trigger(info.id, info.default_trigger);
        if trigger.is_empty() {
            chars.extend(name_chars(info.id));
        } else if let Some(c) = trigger.chars().last() {
            chars.insert(c);
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
        let trigger = config.trigger(info.id, info.default_trigger);
        let Some((query, start)) = token_for(&before_cursor, trigger, info.id) else {
            continue;
        };
        let range = Range::new(
            Position::new(position.line, start),
            Position::new(position.line, position.character),
        );

        if info.id == UNICODE {
            // Dynamic scheme: the query is a hex code point.
            if let Some(item) = codepoint_item(query, trigger, info.display, range) {
                items.push(item);
            }
        } else {
            items.extend(
                complete_in(info.id, query, config.include_ascii).map(|symbol| {
                    completion_item(symbol, trigger, info.display, range, query, config.snippets)
                }),
            );
        }
    }

    // Collapse identical completions (same typed name + inserted text) from
    // different schemes, keeping the first by `enabled_schemes` order.
    if config.dedupe {
        let mut seen = HashSet::new();
        items.retain(|item| seen.insert((item.label.clone(), inserted_text(item).to_string())));
    }

    (!items.is_empty()).then_some(items)
}

/// The token under the cursor for `trigger`: the text after the trigger string,
/// or — when `trigger` is empty — the maximal run of the scheme's name characters.
/// Returns the query and the UTF-16 start column of the text it replaces.
fn token_for<'a>(before_cursor: &'a str, trigger: &str, scheme_id: &str) -> Option<(&'a str, u32)> {
    if trigger.is_empty() {
        bare_token(before_cursor, scheme_id)
    } else {
        prefix_token(before_cursor, trigger)
    }
}

/// Token after the last occurrence of `trigger` (no whitespace between it and the
/// cursor), with the UTF-16 start column of the trigger.
fn prefix_token<'a>(before_cursor: &'a str, trigger: &str) -> Option<(&'a str, u32)> {
    let idx = before_cursor.rfind(trigger)?;
    let query = &before_cursor[idx + trigger.len()..];
    if query.contains(char::is_whitespace) {
        return None;
    }
    Some((query, utf16_col(before_cursor, idx)))
}

/// Token for a no-trigger scheme: the maximal run of the scheme's name characters
/// ending at the cursor, with its UTF-16 start column.
fn bare_token<'a>(before_cursor: &'a str, scheme_id: &str) -> Option<(&'a str, u32)> {
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

/// The text a completion item inserts (its text edit's `new_text`), or `""`.
fn inserted_text(item: &CompletionItem) -> &str {
    match &item.text_edit {
        Some(CompletionTextEdit::Edit(edit)) => &edit.new_text,
        _ => "",
    }
}

/// Sort key for a candidate `name` matched by `query`: an exact match first,
/// then shorter names, then alphabetical. Lexicographic ordering over the
/// rendered key reproduces that, so clients that honour `sortText` (and clients
/// that use it to break ties) put the name you fully typed at the top.
fn sort_key(name: &str, query: &str) -> String {
    let rank = if name.eq_ignore_ascii_case(query) {
        0
    } else {
        1
    };
    format!("{rank}{:04}{name}", name.len().min(9999))
}

/// Turn a [`Symbol`] into a completion item whose acceptance inserts the value
/// over the typed `trigger` + name (`range`). An empty `trigger` inserts over the
/// bare name.
fn completion_item(
    symbol: &Symbol,
    trigger: &str,
    scheme_display: &str,
    range: Range,
    query: &str,
    snippets: bool,
) -> CompletionItem {
    let typed = format!("{trigger}{}", symbol.name);
    let glyph = symbol.value.clone();
    // a pair inserted as a snippet, the cursor between its halves
    let (new_text, format) = match symbol.cursor {
        Some(at) if snippets => {
            let (before, after) = glyph.split_at(at);
            let text = format!("{}$0{}", snippet_text(before), snippet_text(after));
            (text, Some(InsertTextFormat::SNIPPET))
        }
        _ => (glyph.clone(), None),
    };
    let detail = if symbol.description.is_empty() {
        glyph.clone()
    } else {
        format!("{glyph}  {}", symbol.description)
    };

    CompletionItem {
        label: typed.clone(),
        label_details: Some(CompletionItemLabelDetails {
            detail: Some(format!("  {glyph}")),
            description: Some(scheme_display.to_string()),
        }),
        kind: Some(CompletionItemKind::VALUE),
        detail: Some(detail),
        // `documentation` is reconstructed lazily in `completion_resolve` from
        // this `data`; formatting Markdown for every candidate here is the hot
        // completion path's biggest cost (see `build_documentation`).
        data: Some(item_data(
            &glyph,
            &typed,
            symbol.description,
            symbol.class,
            scheme_display,
        )),
        filter_text: Some(typed.clone()),
        sort_text: Some(sort_key(&symbol.name, query)),
        text_edit: Some(CompletionTextEdit::Edit(TextEdit { range, new_text })),
        insert_text_format: format,
        ..Default::default()
    }
}

/// Text that a snippet inserts as it stands: `$`, `}` and `\` escaped.
fn snippet_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '$' | '}' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// The small payload stashed on a completion item's `data`, from which
/// [`completion_resolve`] rebuilds its `documentation` on demand.
fn item_data(glyph: &str, typed: &str, desc: &str, class: Option<&str>, scheme: &str) -> Value {
    #[derive(Serialize)]
    struct ItemData<'a> {
        glyph: &'a str,
        typed: &'a str,
        desc: &'a str,
        class: Option<&'a str>,
        scheme: &'a str,
    }
    serde_json::to_value(ItemData {
        glyph,
        typed,
        desc,
        class,
        scheme,
    })
    .unwrap_or(Value::Null)
}

/// Rebuild an item's Markdown `documentation` from the `data` stashed on it by
/// [`completion_item`] / [`codepoint_item`]. Called from `completion_resolve`, so
/// the hot completion path never formats docs for candidates that go unshown.
fn build_documentation(data: &Value) -> Option<String> {
    let glyph = data.get("glyph")?.as_str()?;
    let typed = data.get("typed")?.as_str()?;
    let scheme = data.get("scheme")?.as_str()?;
    let desc = data.get("desc").and_then(Value::as_str).unwrap_or("");
    let class = data.get("class").and_then(Value::as_str);

    let codepoints = glyph
        .chars()
        .map(|c| format!("U+{:04X}", c as u32))
        .collect::<Vec<_>>()
        .join(" ");
    let class = class.map(|c| format!(", \\{c}")).unwrap_or_default();
    let desc_block = if desc.is_empty() {
        String::new()
    } else {
        format!("{desc}\n\n")
    };
    Some(format!(
        "## {glyph}\n\n`{typed}` → `{glyph}`  ({codepoints}{class})\n\n{desc_block}*scheme: {scheme}*"
    ))
}

/// Completion item for the dynamic `unicode` scheme: `hex` (the text after the
/// trigger) parsed as a code point. `None` if it is not a valid scalar value.
fn codepoint_item(
    hex: &str,
    trigger: &str,
    scheme_display: &str,
    range: Range,
) -> Option<CompletionItem> {
    // Reject empty or non-hex input (e.g. the stray `+` in `U++41`).
    if hex.is_empty() || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let cp = u32::from_str_radix(hex, 16).ok()?;
    let ch = char::from_u32(cp)?;
    let label = format!("{trigger}{hex}");
    let glyph = ch.to_string();

    Some(CompletionItem {
        label: label.clone(),
        label_details: Some(CompletionItemLabelDetails {
            detail: Some(format!("  {glyph}")),
            description: Some(scheme_display.to_string()),
        }),
        kind: Some(CompletionItemKind::VALUE),
        detail: Some(format!("{glyph}  U+{cp:04X}")),
        data: Some(item_data(&glyph, &label, "", None, scheme_display)),
        filter_text: Some(label.clone()),
        sort_text: Some(format!("{cp:08X}")),
        text_edit: Some(CompletionTextEdit::Edit(TextEdit {
            range,
            new_text: glyph,
        })),
        ..Default::default()
    })
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

    // tokio's stdin is read on a blocking background thread; if the client sent
    // `exit` without closing our stdin, dropping the runtime would wait on that
    // read forever and the process would outlive the editor. Exit explicitly.
    std::process::exit(0);
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
            triggers: BTreeMap::new(),
            dedupe: false, // tests opt in explicitly
            snippets: false,
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
    fn latex_backslash() {
        let items = completions_at("\\alpha", pos(0, 6), &cfg(&["latex"])).expect("items");
        assert_eq!(edit(find(&items, "\\alpha")).new_text, "α");
    }

    #[test]
    fn typst_backslash_dotted() {
        let line = "\\arrow.r.double";
        let items =
            completions_at(line, pos(0, line.len() as u32), &cfg(&["typst"])).expect("items");
        let e = edit(find(&items, "\\arrow.r.double"));
        assert_eq!(e.new_text, "⇒");
        assert_eq!(e.range.end.character, line.len() as u32);
    }

    #[test]
    fn unicode_codepoint() {
        let items = completions_at("U+2200", pos(0, 6), &cfg(&["unicode"])).expect("items");
        let e = edit(find(&items, "U+2200"));
        assert_eq!(e.new_text, "∀");
        assert_eq!(e.range.start.character, 0);
        assert_eq!(e.range.end.character, 6);
    }

    #[test]
    fn unicode_codepoint_allows_ascii_targets() {
        // The unicode scheme inserts any code point, including ASCII.
        let items = completions_at("U+0041", pos(0, 6), &cfg(&["unicode"])).expect("items");
        assert_eq!(edit(find(&items, "U+0041")).new_text, "A");
    }

    #[test]
    fn unicode_codepoint_invalid_or_empty_yields_nothing() {
        assert!(completions_at("U+zz", pos(0, 4), &cfg(&["unicode"])).is_none());
        assert!(completions_at("U+", pos(0, 2), &cfg(&["unicode"])).is_none());
        // A stray sign is not a hex digit.
        assert!(completions_at("U++41", pos(0, 5), &cfg(&["unicode"])).is_none());
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
    fn empty_trigger_matches_bare_name() {
        // With no trigger, latex names are matched inline as they are typed.
        let mut c = cfg(&["latex"]);
        c.triggers.insert("latex".to_string(), String::new());
        let items = completions_at("alpha", pos(0, 5), &c).expect("items");
        let e = edit(find(&items, "alpha")); // label has no prefix
        assert_eq!(e.new_text, "α");
        assert_eq!(e.range.start.character, 0);
        assert_eq!(e.range.end.character, 5);
    }

    #[test]
    fn per_scheme_trigger_override() {
        let mut c = cfg(&["typst"]);
        c.triggers.insert("typst".to_string(), ";".to_string());
        let items = completions_at(";alpha", pos(0, 6), &c).expect("items");
        assert_eq!(edit(find(&items, ";alpha")).new_text, "α");
        // The default backslash no longer triggers Typst.
        assert!(completions_at("\\alpha", pos(0, 6), &c).is_none());
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
    fn no_trigger_text_no_completion() {
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
    fn dedupe_collapses_identical_cross_scheme() {
        // unicode-math and typst both provide \in -> ∈.
        let mut c = cfg(&["unicode-math", "typst"]);
        c.dedupe = true;
        let items = completions_at("\\in", pos(0, 3), &c).expect("items");
        let ins = items
            .iter()
            .filter(|i| i.label == "\\in")
            .collect::<Vec<_>>();
        assert_eq!(ins.len(), 1);
        assert_eq!(
            ins[0]
                .label_details
                .as_ref()
                .and_then(|d| d.description.as_deref()),
            Some("unicode-math")
        );
    }

    #[test]
    fn dedupe_keeps_distinct_names_for_same_char() {
        let mut c = cfg(&["latex"]);
        c.dedupe = true;
        let items = completions_at("\\le", pos(0, 3), &c).expect("items");
        let labels: Vec<_> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"\\le"));
        assert!(labels.contains(&"\\leq"));
    }

    #[test]
    fn dedupe_off_keeps_every_scheme() {
        let mut c = cfg(&["unicode-math", "typst"]);
        c.dedupe = false;
        let items = completions_at("\\in", pos(0, 3), &c).expect("items");
        assert!(items.iter().filter(|i| i.label == "\\in").count() >= 2);
    }

    #[test]
    fn config_parses_triggers() {
        let v = serde_json::json!({
            "enabledSchemes": ["unicode-math", "typst"],
            "includeAscii": true,
            "triggers": { "typst": ";" }
        });
        let c = merged_config(&Config::default(), &v);
        assert_eq!(c.enabled_schemes, vec!["unicode-math", "typst"]);
        assert!(c.include_ascii);
        assert_eq!(c.trigger("typst", "\\"), ";");
        assert_eq!(c.trigger("unicode-math", "\\"), "\\"); // default kept
        assert!(c.dedupe); // on by default when unspecified
    }

    #[test]
    fn config_parses_under_unikodo_key() {
        let v = serde_json::json!({"unikodo": {"enabledSchemes": ["typst"]}});
        let c = merged_config(&Config::default(), &v);
        assert_eq!(c.enabled_schemes, vec!["typst"]);
        assert!(!c.include_ascii);
    }

    #[test]
    fn partial_update_preserves_untouched_settings() {
        // A delta that sets only `triggers` must not reset the other settings.
        let base = Config {
            enabled_schemes: vec!["unicode-math".to_string(), "typst".to_string()],
            include_ascii: true,
            triggers: BTreeMap::new(),
            dedupe: false,
            snippets: false,
        };
        let merged = merged_config(&base, &serde_json::json!({ "triggers": { "typst": ";" } }));
        assert_eq!(merged.enabled_schemes, base.enabled_schemes);
        assert!(merged.include_ascii);
        assert!(!merged.dedupe);
        assert_eq!(merged.trigger("typst", "\\"), ";");
    }

    #[test]
    fn exact_match_sorts_before_longer_candidates() {
        // A client ordering by `sortText` must put the fully typed name first:
        // `\leftrightarrow` ahead of `\leftrightarrows` and friends, and never
        // behind a longer name that merely contains the query.
        let items =
            completions_at("\\leftrightarrow", pos(0, 16), &cfg(&["unicode-math"])).expect("items");
        let mut sorted = items.clone();
        sorted.sort_by(|a, b| a.sort_text.cmp(&b.sort_text));
        assert_eq!(sorted[0].label, "\\leftrightarrow");
        assert!(
            sorted.len() > 1,
            "expected longer candidates to compare against"
        );
        let first = find(&items, "\\leftrightarrow")
            .sort_text
            .as_deref()
            .expect("sort_text");
        for item in &items {
            if item.label != "\\leftrightarrow" {
                assert!(
                    first < item.sort_text.as_deref().expect("sort_text"),
                    "`{}` sorted at or before the exact match",
                    item.label
                );
            }
        }
    }

    #[test]
    fn sort_key_ranks_exact_then_shortest() {
        assert!(sort_key("leq", "leq") < sort_key("leqq", "leq"));
        assert!(sort_key("leqq", "leq") < sort_key("leqslant", "leq"));
        // Case-insensitive, so an exact match still wins when the client
        // lower-cases (or the user shifts) the query.
        assert!(
            sort_key("Leftrightarrow", "leftrightarrow")
                < sort_key("nLeftrightarrow", "leftrightarrow")
        );
    }

    #[test]
    fn items_defer_documentation_to_resolve() {
        // The completion response omits `documentation`; resolve rebuilds it from `data`.
        let items = completions_at("\\leq", pos(0, 4), &cfg(&["unicode-math"])).expect("items");
        let item = find(&items, "\\leq");
        assert!(item.documentation.is_none());
        let doc = build_documentation(item.data.as_ref().expect("data")).expect("documentation");
        assert!(doc.contains('≤'));
        assert!(doc.contains("scheme: unicode-math"));
    }

    #[test]
    fn a_pair_is_a_snippet_where_the_client_takes_them() {
        let text = "\\esc";
        let mut config = cfg(&["abacus"]);
        let items = completions_at(text, pos(0, 4), &config).expect("completions");
        let item = find(&items, "\\esc");
        assert_eq!(edit(item).new_text, "«»");
        assert_eq!(item.insert_text_format, None);
        config.snippets = true;
        let items = completions_at(text, pos(0, 4), &config).expect("completions");
        let item = find(&items, "\\esc");
        assert_eq!(edit(item).new_text, "«$0»");
        assert_eq!(item.insert_text_format, Some(InsertTextFormat::SNIPPET));
        // a symbol of no pair stays plain text
        let items = completions_at("\\the", pos(0, 4), &config).expect("completions");
        assert_eq!(find(&items, "\\the").insert_text_format, None);
        assert_eq!(snippet_text("a$b}c\\"), "a\\$b\\}c\\\\");
    }

    #[test]
    fn a_settings_change_keeps_the_clients_snippet_support() {
        let base = Config {
            snippets: true,
            ..Config::default()
        };
        let merged = merged_config(&base, &serde_json::json!({"dedupe": false}));
        assert!(merged.snippets && !merged.dedupe);
    }

    #[test]
    fn trigger_characters_only_for_enabled_schemes() {
        // Default (unicode-math) advertises the backslash, not the ascii alphabet.
        let base = trigger_characters(&cfg(&["unicode-math"]));
        assert!(base.contains(&"\\".to_string()));
        assert!(!base.contains(&"=".to_string()));
        // Enabling ascii brings in its digraph characters.
        let with_ascii = trigger_characters(&cfg(&["unicode-math", "ascii"]));
        assert!(with_ascii.contains(&"=".to_string()));
    }
}
