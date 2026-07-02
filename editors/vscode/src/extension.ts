import * as https from "https";
import { gunzipSync } from "zlib";
import { chmod } from "fs/promises";
import {
  workspace,
  window,
  ProgressLocation,
  Uri,
  FileType,
  ExtensionContext,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

const REPO = "Deducteam/unikodo";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const config = workspace.getConfiguration("unikodo");
  const command = await resolveServer(context);
  const languages = config.get<string[]>("languages") ?? ["*"];

  const serverOptions: ServerOptions = {
    run: { command, transport: TransportKind.stdio },
    debug: { command, transport: TransportKind.stdio },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: languages.includes("*")
      ? [{ scheme: "file" }, { scheme: "untitled" }]
      : languages.map((language) => ({ scheme: "file", language })),
    initializationOptions: {
      enabledSchemes: config.get<string[]>("enabledSchemes") ?? ["unicode-math"],
      includeAscii: config.get<boolean>("includeAscii") ?? false,
      triggers: config.get<Record<string, string>>("triggers") ?? {},
      dedupe: config.get<boolean>("dedupe") ?? true,
    },
    // Propagate live setting changes to the server.
    synchronize: {
      configurationSection: "unikodo",
    },
  };

  client = new LanguageClient("unikodo", "Unikodo", serverOptions, clientOptions);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

// Pick the server command. An explicit `serverPath` wins (a bare name resolves
// on PATH, an absolute path is used as-is). Otherwise download the binary that
// matches this extension's version, caching it under global storage — and if
// that fails, fall back to `unikodo-lsp` on PATH so a hand-installed server
// still works.
async function resolveServer(context: ExtensionContext): Promise<string> {
  const configured = (
    workspace.getConfiguration("unikodo").get<string>("serverPath") ?? ""
  ).trim();
  if (configured) return configured;

  try {
    return await downloadedServer(context);
  } catch (err) {
    window.showWarningMessage(
      `Unikodo: couldn't download the language server (${err}). ` +
        "Falling back to 'unikodo-lsp' on your PATH.",
    );
    return "unikodo-lsp";
  }
}

async function downloadedServer(context: ExtensionContext): Promise<string> {
  const version = context.extension.packageJSON.version as string;
  const { target, exeExt } = platformTarget();

  const dir = Uri.joinPath(context.globalStorageUri, `server-${version}`);
  const binary = Uri.joinPath(dir, `unikodo-lsp${exeExt}`);
  try {
    await workspace.fs.stat(binary);
    return binary.fsPath; // already downloaded
  } catch {
    // not present yet
  }

  const asset = `unikodo-lsp-${target}${exeExt}.gz`;
  const url = `https://github.com/${REPO}/releases/download/v${version}/${asset}`;

  const bytes = await window.withProgress(
    { location: ProgressLocation.Notification, title: `Unikodo: downloading language server ${version}…` },
    async () => gunzipSync(await httpGet(url)),
  );

  await workspace.fs.createDirectory(dir);
  await workspace.fs.writeFile(binary, new Uint8Array(bytes));
  if (process.platform !== "win32") await chmod(binary.fsPath, 0o755);
  await cleanupOldVersions(context, `server-${version}`);

  return binary.fsPath;
}

function platformTarget(): { target: string; exeExt: string } {
  const targets: Record<string, string> = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "win32-x64": "x86_64-pc-windows-msvc",
  };
  const target = targets[`${process.platform}-${process.arch}`];
  if (!target) {
    throw new Error(`unsupported platform ${process.platform}/${process.arch}`);
  }
  return { target, exeExt: process.platform === "win32" ? ".exe" : "" };
}

// GET a URL into a Buffer, following redirects (GitHub release assets redirect
// to a signed storage URL). Uses core `https` so it works on every VS Code /
// Node version.
function httpGet(url: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "unikodo-vscode" } }, (res) => {
        const { statusCode = 0, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          if (redirects <= 0) return reject(new Error("too many redirects"));
          resolve(httpGet(new URL(headers.location, url).toString(), redirects - 1));
          return;
        }
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${statusCode} for ${url}`));
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function cleanupOldVersions(context: ExtensionContext, keep: string): Promise<void> {
  try {
    const entries = await workspace.fs.readDirectory(context.globalStorageUri);
    for (const [name, type] of entries) {
      if (type === FileType.Directory && name.startsWith("server-") && name !== keep) {
        await workspace.fs.delete(Uri.joinPath(context.globalStorageUri, name), {
          recursive: true,
        });
      }
    }
  } catch {
    // best-effort
  }
}
