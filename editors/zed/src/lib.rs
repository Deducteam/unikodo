//! Zed extension for unikodo.
//!
//! Zed extensions compile to WebAssembly and run inside the editor. This one is
//! a thin shim: it locates the `unikodo-lsp` binary on the user's `PATH` and
//! tells Zed to launch it. All completion logic lives in the server.

use zed_extension_api::{self as zed, Command, LanguageServerId, Result, Worktree};

struct UnikodoExtension;

impl zed::Extension for UnikodoExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Command> {
        let path = worktree.which("unikodo-lsp").ok_or_else(|| {
            "could not find `unikodo-lsp` on your PATH. Build and install it with \
             `cargo install --path crates/unikodo-lsp` from the unikodo repository \
             (https://github.com/Deducteam/unikodo)."
                .to_string()
        })?;

        Ok(Command {
            command: path,
            args: Vec::new(),
            env: Vec::new(),
        })
    }
}

zed::register_extension!(UnikodoExtension);
