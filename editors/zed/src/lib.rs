//! Zed extension for unikodo.
//!
//! Zed extensions compile to WebAssembly and run inside the editor. This one is
//! a thin shim that points Zed at the `unikodo-lsp` server binary. All the
//! completion logic lives in the server.
//!
//! Resolution order: an explicit `unikodo-lsp` on the user's `PATH` wins;
//! otherwise the matching binary is downloaded from the repo's GitHub Releases
//! and cached, so users never need a Rust toolchain.

use std::fs;

use zed_extension_api::{self as zed, Command, LanguageServerId, Result, Worktree};

const REPO: &str = "Deducteam/unikodo";

struct UnikodoExtension {
    cached_binary_path: Option<String>,
}

impl UnikodoExtension {
    fn server_binary_path(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<String> {
        // 1. An explicit binary on the user's PATH always wins.
        if let Some(path) = worktree.which("unikodo-lsp") {
            return Ok(path);
        }

        // 2. Reuse an earlier download while it is still present.
        if let Some(path) = &self.cached_binary_path {
            if fs::metadata(path).is_ok_and(|m| m.is_file()) {
                return Ok(path.clone());
            }
        }

        // 3. Download the release asset matching this platform.
        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );
        let release = zed::latest_github_release(
            REPO,
            zed::GithubReleaseOptions { require_assets: true, pre_release: false },
        )?;

        let (os, arch) = zed::current_platform();
        let (target, ext) = match (os, arch) {
            (zed::Os::Mac, zed::Architecture::Aarch64) => ("aarch64-apple-darwin", ""),
            (zed::Os::Mac, zed::Architecture::X8664) => ("x86_64-apple-darwin", ""),
            (zed::Os::Linux, zed::Architecture::Aarch64) => ("aarch64-unknown-linux-gnu", ""),
            (zed::Os::Linux, zed::Architecture::X8664) => ("x86_64-unknown-linux-gnu", ""),
            (zed::Os::Windows, zed::Architecture::X8664) => ("x86_64-pc-windows-msvc", ".exe"),
            (os, arch) => return Err(format!("unsupported platform: {os:?}/{arch:?}")),
        };
        let asset_name = format!("unikodo-lsp-{target}{ext}.gz");

        let asset = release
            .assets
            .iter()
            .find(|a| a.name == asset_name)
            .ok_or_else(|| format!("release {} has no asset `{asset_name}`", release.version))?;

        let version_dir = format!("unikodo-lsp-{}", release.version);
        let binary_path = format!("{version_dir}/unikodo-lsp{ext}");

        if !fs::metadata(&binary_path).is_ok_and(|m| m.is_file()) {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            fs::create_dir_all(&version_dir)
                .map_err(|e| format!("failed to create `{version_dir}`: {e}"))?;
            zed::download_file(&asset.download_url, &binary_path, zed::DownloadedFileType::Gzip)?;
            zed::make_file_executable(&binary_path)?;

            // Drop stale downloads from earlier versions.
            if let Ok(entries) = fs::read_dir(".") {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let stale = name
                        .to_str()
                        .is_some_and(|n| n.starts_with("unikodo-lsp-") && n != version_dir);
                    if stale {
                        fs::remove_dir_all(entry.path()).ok();
                    }
                }
            }
        }

        self.cached_binary_path = Some(binary_path.clone());
        Ok(binary_path)
    }
}

impl zed::Extension for UnikodoExtension {
    fn new() -> Self {
        Self { cached_binary_path: None }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Command> {
        let command = self.server_binary_path(language_server_id, worktree)?;
        Ok(Command { command, args: Vec::new(), env: Vec::new() })
    }
}

zed::register_extension!(UnikodoExtension);
