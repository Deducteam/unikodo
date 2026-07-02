# Publishing unikodo

How to cut a release: build the server binaries, publish the two crates, and
push the VS Code / Zed extensions to their registries. Steps 3–5 need
credentials (marked 🔑); everything else is automated.

The extensions download the `unikodo-lsp` binary that matches their version from
the tag's GitHub Release, so **tag first (step 2), then publish** — the release
assets must exist before anyone installs.

## One-time account setup 🔑

- **crates.io** — `cargo login` with a token from <https://crates.io/settings/tokens>.
  You must be an owner of `unikodo-core` and `unikodo-lsp` (the first publish
  creates them under your account; add others with `cargo owner --add`).
- **VS Code Marketplace** — create the **`deducteam`** publisher at
  <https://marketplace.visualstudio.com/manage>, then a Personal Access Token
  (Azure DevOps → All accessible orgs → *Marketplace: Manage*). `vsce login deducteam`.
- **Open VSX** — sign in at <https://open-vsx.org>, create the **`deducteam`**
  namespace (`npx ovsx create-namespace deducteam -p <TOKEN>`), and generate an
  access token.
- **Zed** — no token; publishing is a PR to `zed-industries/extensions`.

## 1. Bump the version

Keep all three in sync (the VS Code client downloads the binary for its own
version, and the release tag must match):

- `Cargo.toml` → `[workspace.package] version`
- `editors/vscode/package.json` → `version`
- `editors/zed/extension.toml` → `version`

Commit the bump.

## 2. Tag → build binaries (automated)

```sh
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` cross-compiles `unikodo-lsp` for macOS
(x64/arm64), Linux (x64/arm64), and Windows (x64) and attaches
`unikodo-lsp-<target>[.exe].gz` (+ `.sha256`) to the GitHub Release for the tag.
Wait for it to finish and confirm the assets are attached before continuing.

## 3. Publish the crates 🔑

Order matters — `unikodo-lsp` depends on `unikodo-core`:

```sh
cargo publish -p unikodo-core
# wait ~30s for the index to update, then:
cargo publish -p unikodo-lsp
```

(Dry run any time with `cargo publish --dry-run -p unikodo-core`.)

## 4. Publish the VS Code extension 🔑

```sh
cd editors/vscode
npm ci
npx @vscode/vsce package -o unikodo.vsix   # sanity-check the .vsix
npx @vscode/vsce publish                    # → Marketplace (uses `vsce login`)
npx ovsx publish unikodo.vsix -p <OVSX_TOKEN>   # → Open VSX
```

Verify: <https://marketplace.visualstudio.com/items?itemName=deducteam.unikodo>
and <https://open-vsx.org/extension/deducteam/unikodo>.

## 5. Publish the Zed extension 🔑 (PR)

Zed's registry pins each extension as a git submodule.

1. Fork and clone <https://github.com/zed-industries/extensions>.
2. Add unikodo as a submodule at the release tag:
   ```sh
   git submodule add https://github.com/Deducteam/unikodo.git extensions/unikodo
   git -C extensions/unikodo checkout v0.1.0
   ```
3. Add an entry to `extensions.toml` (the extension lives in a subdirectory):
   ```toml
   [unikodo]
   submodule = "extensions/unikodo"
   path = "editors/zed"
   version = "0.1.0"   # must equal editors/zed/extension.toml
   ```
4. `pnpm sort-extensions` (their repo's normalizer), commit, and open a PR.
   Zed's CI builds the wasm and, once merged, the extension appears in
   `zed: extensions`.

## 6. Website

The homepage install buttons already point at the Marketplace / Open VSX / Zed
listings, and the deploy pulls from `main` — no change needed per release. If a
listing URL ever changes, update `EXTENSIONS` in `web/src/app/page.tsx`.

## Optional: automate in CI

Steps 3–4 can move into `release.yml` (triggered by the same tag) once the
tokens are added as repository secrets — `CARGO_REGISTRY_TOKEN`, `VSCE_PAT`,
`OVSX_PAT`. Kept manual here so the first release of each listing can be
eyeballed before it goes live.
