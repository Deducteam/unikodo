//! unikodo LSP server: Unicode (math) symbol completions.
//!
//! Completion is triggered by a backslash. After the user types `\` followed by
//! (the start of) a `unicode-math` macro name, the server offers matching
//! symbols; accepting one replaces the typed `\macro` with the Unicode
//! character itself.

use dashmap::DashMap;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};
use unikodo_core::{complete, Symbol};

/// Whether ASCII-valued macros (e.g. `\lparen` → `(`) are offered. unikodo is
/// about *non-ASCII* characters, so these are hidden.
const INCLUDE_ASCII: bool = false;

struct Backend {
    client: Client,
    /// Full text of each open document, kept current via `FULL` text sync.
    documents: DashMap<Url, String>,
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
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
                    trigger_characters: Some(vec!["\\".to_string()]),
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

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        self.documents
            .insert(params.text_document.uri, params.text_document.text);
    }

    async fn did_change(&self, mut params: DidChangeTextDocumentParams) {
        // FULL sync: the final change carries the entire new document text.
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

        let items = self
            .documents
            .get(&uri)
            .and_then(|text| completions_at(text.value(), position));

        Ok(items.map(|items| {
            CompletionResponse::List(CompletionList {
                is_incomplete: false,
                items,
            })
        }))
    }
}

/// Build completion items for `position` within `text`, or `None` if the cursor
/// is not inside a `\macro` fragment.
///
/// A free function (rather than a method) so it can be unit-tested without a
/// live LSP [`Client`].
fn completions_at(text: &str, position: Position) -> Option<Vec<CompletionItem>> {
    let line = text.lines().nth(position.line as usize).unwrap_or_default();

    // LSP character offsets count UTF-16 code units, so slice the line in those
    // units rather than by bytes or `char`s.
    let units: Vec<u16> = line.encode_utf16().collect();
    let cursor = (position.character as usize).min(units.len());
    let before_cursor = String::from_utf16_lossy(&units[..cursor]);

    // Only complete when the cursor sits in a `\macro` fragment (no whitespace
    // between the backslash and the cursor).
    let backslash = before_cursor.rfind('\\')?;
    let prefix = &before_cursor[backslash + 1..];
    if prefix.contains(char::is_whitespace) {
        return None;
    }

    // The edit replaces everything from the backslash up to the cursor.
    let start = position.character - before_cursor[backslash..].encode_utf16().count() as u32;
    let range = Range::new(
        Position::new(position.line, start),
        Position::new(position.line, position.character),
    );

    Some(
        complete(prefix, INCLUDE_ASCII)
            .map(|symbol| completion_item(symbol, range))
            .collect(),
    )
}

/// Turn a [`Symbol`] into a completion item whose acceptance inserts the
/// character over the typed `\macro` (`range`).
fn completion_item(symbol: &Symbol, range: Range) -> CompletionItem {
    let macro_name = format!("\\{}", symbol.name);
    let character = symbol.ch.to_string();

    CompletionItem {
        label: macro_name.clone(),
        label_details: Some(CompletionItemLabelDetails {
            detail: Some(format!("  {character}")),
            description: Some(symbol.class.to_string()),
        }),
        kind: Some(CompletionItemKind::TEXT),
        detail: Some(format!("{character}  {}", symbol.description)),
        documentation: Some(Documentation::MarkupContent(MarkupContent {
            kind: MarkupKind::Markdown,
            value: format!(
                "## {character}\n\n`{macro_name}` → `{character}`  ({usv}, `\\{class}`)\n\n{desc}",
                usv = symbol.usv(),
                class = symbol.class,
                desc = symbol.description,
            ),
        })),
        filter_text: Some(macro_name),
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
    });

    Server::new(stdin, stdout, socket).serve(service).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pos(line: u32, character: u32) -> Position {
        Position::new(line, character)
    }

    fn edit(item: &CompletionItem) -> &TextEdit {
        match &item.text_edit {
            Some(CompletionTextEdit::Edit(edit)) => edit,
            _ => panic!("expected a plain text edit"),
        }
    }

    #[test]
    fn completes_after_backslash() {
        let items = completions_at("\\leq", pos(0, 4)).expect("completions");
        let leq = items
            .iter()
            .find(|i| i.label == "\\leq")
            .expect("\\leq present");

        let e = edit(leq);
        assert_eq!(e.new_text, "≤");
        assert_eq!(e.range.start.character, 0);
        assert_eq!(e.range.end.character, 4);
    }

    #[test]
    fn no_completion_without_backslash() {
        assert!(completions_at("leq", pos(0, 3)).is_none());
    }

    #[test]
    fn bare_backslash_offers_many() {
        let items = completions_at("\\", pos(0, 1)).expect("completions");
        assert!(items.len() > 1000);
    }

    #[test]
    fn respects_utf16_offsets() {
        // '𝕏' (U+1D54F) is two UTF-16 code units; the replacement range's start
        // column must account for that.
        let line = "𝕏\\leq";
        let cursor = line.encode_utf16().count() as u32; // 2 + 1 + 3 = 6
        let items = completions_at(line, pos(0, cursor)).expect("completions");
        let leq = items.iter().find(|i| i.label == "\\leq").unwrap();

        let e = edit(leq);
        assert_eq!(e.range.start.character, 2);
        assert_eq!(e.range.end.character, 6);
    }
}
