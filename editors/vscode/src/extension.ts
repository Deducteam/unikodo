import { workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(_context: ExtensionContext): void {
  const config = workspace.getConfiguration("unikodo");
  const command = config.get<string>("serverPath") || "unikodo-lsp";
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
      prefixes: config.get<Record<string, string>>("prefixes") ?? {},
    },
    // Propagate live setting changes to the server.
    synchronize: {
      configurationSection: "unikodo",
    },
  };

  client = new LanguageClient(
    "unikodo",
    "Unikodo",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
