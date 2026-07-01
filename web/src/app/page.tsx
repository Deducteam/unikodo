import Link from "next/link";
import { ArrowRight, GithubLogo } from "@phosphor-icons/react/dist/ssr";

import { characterCount } from "@/lib/symbols";
import { Panel, PanelHeader } from "@/components/andromeda/panel";
import { CodeBlock } from "@/components/code-block";
import { HeroDemo } from "@/components/home/hero-demo";
import { buttonVariants } from "@/components/ui/button";

const REPO_URL = "https://github.com/Deducteam/unikodo";

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export default function HomePage() {
  const count = characterCount();

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
      {/* ============================ HERO ============================ */}
      <section className="grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
        <div className="animate-fade-up">
          <h1 className="text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
            unikodo
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-secondary">
            a language server for unicode characters.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/browse" className={buttonVariants({ size: "lg" })}>
              Browse {fmt(count)} symbols
              <ArrowRight size={16} weight="bold" />
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <GithubLogo size={16} /> View on GitHub
            </a>
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <HeroDemo />
        </div>
      </section>

      {/* =================== INSTALLATION & CONFIG ==================== */}
      <section id="install" className="scroll-mt-20 py-12">
        <SectionHeading
          title="Installation & configuration"
          description="unikodo is a single Rust binary. Build it, put it on your PATH, and point any LSP-capable editor at it — then enable the naming schemes you use."
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <CodeBlock
              label="install the server"
              code={`# build + install onto your PATH\ncargo install --path crates/unikodo-lsp\n\n# it speaks LSP over stdio\nunikodo-lsp`}
            />
            <CodeBlock
              label="Neovim — any LSP client"
              code={`vim.lsp.start({\n  name = "unikodo",\n  cmd = { "unikodo-lsp" },\n})`}
            />
          </div>

          <div className="space-y-4">
            <CodeBlock
              label="VSCode settings.json"
              code={`"unikodo.enabledSchemes": [\n  "unicode-math", "latex", "typst", "unicode"\n],\n"unikodo.includeAscii": false`}
            />
            <Panel className="overflow-hidden">
              <PanelHeader title="Configuration" />
              <dl className="divide-y divide-wire-subtle text-[13px]">
                {[
                  ["enabledSchemes", '["unicode-math"]', "Which schemes to offer."],
                  ["includeAscii", "false", "Also offer ASCII-target names."],
                  ["triggers", "{}", "Per-scheme trigger overrides."],
                  ["dedupe", "true", "Collapse identical completions."],
                ].map(([key, def, desc]) => (
                  <div key={key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                    <code className="text-ink">{key}</code>
                    <code className="text-[11px] text-ink-faint">{def}</code>
                    <span className="w-full text-[12px] text-ink-muted sm:w-auto sm:flex-1 sm:text-right">
                      {desc}
                    </span>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      {description && (
        <p className="mt-2.5 text-[14px] leading-relaxed text-ink-secondary">
          {description}
        </p>
      )}
    </div>
  );
}
