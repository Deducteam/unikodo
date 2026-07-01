"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Panel } from "@/components/andromeda/panel";
import { Glyph } from "@/components/glyph";
import { loadSearchIndex, type SearchEntry } from "@/lib/search";

/*
  The hero editor. Two modes sharing one render:

  • demo — auto-types a real (lambdapi-checked) modus-ponens proof, firing
    completion pop-ups that swap each macro for its Unicode glyph, then loops.
  • live — the moment you click or type, it becomes a real editor: a transparent
    <textarea> over a highlighted <pre>, with completions pulled from the same
    /search-index.json the ⌘K palette uses. Blur + idle → the demo resumes.

  The highlight layer and the textarea share ONE font stack (mono first, math
  fonts as fallback), so the caret tracks the glyphs even across Unicode. The
  completion pop-up is rendered as a *sibling of the panel* (not inside the
  clipped code area) so it is never truncated; it flips above the caret and
  caps its width to fit.
*/

const CODE_FONT =
  'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, "STIX Two Math", "Cambria Math", "Noto Sans Math", "Noto Sans Symbols2", "Segoe UI Symbol", monospace';

const FONT_SIZE = 13.5;
const LINE_H = 24; // px
const PAD_T = 16; // px
const GUTTER = 40; // px
const POP_W = 258; // px

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// ─── lambdapi syntax highlighting ──────────────────────────────────────────
const KEYWORDS = new Set([
  // commands
  "require", "open", "symbol", "rule", "with", "let", "in", "as", "begin",
  "end", "abort", "admitted", "notation", "inductive", "unif_rule",
  "coerce_rule", "builtin",
  // tactics
  "admit", "apply", "assume", "change", "eval", "fail", "generalize", "have",
  "induction", "orelse", "refine", "reflexivity", "remove", "repeat",
  "rewrite", "set", "simplify", "solve", "symmetry", "try", "why3",
  // queries / flags
  "assert", "assertnot", "compute", "print", "debug", "search", "type",
  "prover", "prover_timeout", "flag", "verbose",
]);
// Modifiers + notation directives → @attribute (cyan italic).
const ATTRIBUTES = new Set([
  "constant", "opaque", "injective", "sequential", "associative",
  "commutative", "private", "protected", "left", "right", "infix", "prefix",
  "postfix", "quantifier", "on", "off",
]);
const BINDERS = new Set(["∀", "∃", "λ", "Π", "Σ"]);
// Relations / operators / arrows. Per the Zed queries these are @punctuation.
const SYMBOLS = new Set(
  Array.from("≤≥≠≔→⇒⇔↔↦↪↩∧∨¬∈∉⊆⊂⊇⊢⊨≡≜×∘·∣⊤⊥∅ℕℤℝℚℂ"),
);

// Colours mirror the roles in editors/zed/languages/lambdapi/highlights.scm.
const TOK_COLOR = {
  keyword: "var(--code-keyword)", // commands, tactics, queries
  attribute: "var(--code-attribute)", // modifiers, notation directives
  constant: "var(--code-constant)", // TYPE, _, ?meta
  func: "var(--code-func)", // symbol/def names, $pattern vars
  type: "var(--code-type)", // inductive type names
  variable: "var(--code-variable)", // identifiers (π, Prop, …)
  string: "var(--code-string)", // strings, module-path prefixes
  number: "var(--code-number)",
  punct: "var(--code-punct)", // operators + binders + brackets/delimiters
  comment: "var(--code-comment)",
  macro: "var(--code-macro)", // pending \macro (web-only)
  plain: "var(--code-variable)",
} as const;

type Tok = { t: keyof typeof TOK_COLOR; c: string };

// A small hand tokenizer approximating the tree-sitter captures: it tracks the
// previous significant token so the identifier after `symbol` reads as a
// definition name (green), and colours operators/binders as punctuation (gray).
function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const ch = Array.from(src);
  const word = (c: string) => /[A-Za-z0-9_']/.test(c);
  let i = 0;
  let prev = ""; // last non-whitespace token text
  const push = (t: Tok["t"], c: string) => {
    out.push({ t, c });
    if (/\S/.test(c)) prev = c;
  };
  while (i < ch.length) {
    const c = ch[i];
    if (c === "/" && ch[i + 1] === "/") {
      let j = i + 2;
      while (j < ch.length && ch[j] !== "\n") j++;
      push("comment", ch.slice(i, j).join(""));
      i = j;
    } else if (c === "\n" || c === " " || c === "\t") {
      out.push({ t: "plain", c }); // whitespace never updates `prev`
      i++;
    } else if (c === "\\") {
      let j = i + 1;
      while (j < ch.length && /[A-Za-z0-9.+]/.test(ch[j])) j++;
      push("macro", ch.slice(i, j).join(""));
      i = j;
    } else if (c === "$") {
      let j = i + 1;
      while (j < ch.length && word(ch[j])) j++;
      push("func", ch.slice(i, j).join("")); // pattern variable
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < ch.length && word(ch[j])) j++;
      const w = ch.slice(i, j).join("");
      let t: Tok["t"];
      if (w === "TYPE" || w === "_") t = "constant";
      else if (KEYWORDS.has(w)) t = "keyword";
      else if (ATTRIBUTES.has(w)) t = "attribute";
      else if (prev === "symbol") t = "func"; // definition name
      else if (prev === "inductive") t = "type"; // inductive type name
      else if (/^[A-Z]/.test(w) && ch[j] === ".") t = "string"; // module prefix
      else t = "variable";
      push(t, w);
      i = j;
    } else if (BINDERS.has(c) || SYMBOLS.has(c)) {
      push("punct", c); // operators & binders → punctuation
      i++;
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < ch.length && /[0-9]/.test(ch[j])) j++;
      push("number", ch.slice(i, j).join(""));
      i = j;
    } else if (/[:;,(){}[\].|@`]/.test(c)) {
      push("punct", c);
      i++;
    } else {
      push("variable", c);
      i++;
    }
  }
  return out;
}

function Highlighted({ src }: { src: string }) {
  const toks = React.useMemo(() => tokenize(src), [src]);
  return (
    <>
      {toks.map((tk, i) => (
        <span
          key={i}
          style={{
            color: TOK_COLOR[tk.t],
            fontStyle:
              tk.t === "comment" || tk.t === "attribute" ? "italic" : undefined,
          }}
        >
          {tk.c}
        </span>
      ))}
    </>
  );
}

// ─── the scripted demo (a real, lambdapi-checked modus-ponens proof) ────────
type PopItem = { name: string; glyph: string; scheme: string };
type Seg =
  | { k: "type"; text: string }
  | {
      k: "complete";
      macro: string;
      query: string;
      glyph: string;
      items: PopItem[];
    };

const PI: PopItem[] = [
  { name: "pi", glyph: "π", scheme: "latex" },
  { name: "Pi", glyph: "Π", scheme: "latex" },
  { name: "varpi", glyph: "ϖ", scheme: "latex" },
  { name: "prod", glyph: "∏", scheme: "latex" },
];
const TO: PopItem[] = [
  { name: "to", glyph: "→", scheme: "latex" },
  { name: "top", glyph: "⊤", scheme: "latex" },
  { name: "times", glyph: "×", scheme: "latex" },
  { name: "otimes", glyph: "⊗", scheme: "latex" },
];
const RARR: PopItem[] = [
  { name: "Rightarrow", glyph: "⇒", scheme: "latex" },
  { name: "rightarrow", glyph: "→", scheme: "latex" },
  { name: "Leftarrow", glyph: "⇐", scheme: "latex" },
  { name: "Leftrightarrow", glyph: "⇔", scheme: "latex" },
];
const COLONEQ: PopItem[] = [
  { name: "coloneq", glyph: "≔", scheme: "unicode-math" },
  { name: "coloneqq", glyph: "≔", scheme: "unicode-math" },
  { name: "equiv", glyph: "≡", scheme: "latex" },
  { name: "triangleq", glyph: "≜", scheme: "latex" },
];

// A short file that `lambdapi check` accepts (uses the stdlib's Prop): modus
// ponens. EVERY Unicode symbol on the statement line is inserted via a
// completion — no glyph is ever "just typed".
const DEMO: Seg[] = [
  { k: "type", text: "require open Stdlib.Prop;\n\nsymbol mp (p q : Prop) : " },
  { k: "complete", macro: "\\pi", query: "pi", glyph: "π", items: PI },
  { k: "type", text: " (p " },
  { k: "complete", macro: "\\Rightarrow", query: "Rightarrow", glyph: "⇒", items: RARR },
  { k: "type", text: " q) " },
  { k: "complete", macro: "\\to", query: "to", glyph: "→", items: TO },
  { k: "type", text: " " },
  { k: "complete", macro: "\\pi", query: "pi", glyph: "π", items: PI },
  { k: "type", text: " p " },
  { k: "complete", macro: "\\to", query: "to", glyph: "→", items: TO },
  { k: "type", text: " " },
  { k: "complete", macro: "\\pi", query: "pi", glyph: "π", items: PI },
  { k: "type", text: " q " },
  { k: "complete", macro: "\\coloneq", query: "coloneq", glyph: "≔", items: COLONEQ },
  { k: "type", text: "\nbegin\n  assume p q pq hp;\n  apply pq hp\nend;" },
];

type Pop = {
  items: PopItem[];
  query: string;
  trigger: string;
  start: number;
};
type Frame = { value: string; caret: number; pop: Pop | null; delay: number };

function buildFrames(): Frame[] {
  const frames: Frame[] = [];
  let value = "";
  const rand = (n: number) => Math.round(Math.random() * n);
  const emit = (pop: Pop | null, delay: number) =>
    frames.push({ value, caret: value.length, pop, delay });

  for (const seg of DEMO) {
    if (seg.k === "type") {
      for (const c of Array.from(seg.text)) {
        value += c;
        emit(null, c === "\n" ? 170 : c === " " ? 44 + rand(28) : 24 + rand(34));
      }
      continue;
    }
    const start = value.length;
    for (const c of Array.from(seg.macro)) {
      value += c;
      const q = value.slice(start).replace(/^\\/, "");
      emit(
        q.length >= 1
          ? { items: seg.items, query: q, trigger: "\\", start }
          : null,
        52 + rand(28),
      );
    }
    emit({ items: seg.items, query: seg.query, trigger: "\\", start }, 580);
    value = value.slice(0, start) + seg.glyph; // accept
    emit(null, 120);
  }
  frames.push({ value, caret: value.length, pop: null, delay: 2600 });
  return frames;
}

// ─── live completions, from the real search index ──────────────────────────
function completeMacro(index: SearchEntry[], frag: string): PopItem[] {
  const q = frag.toLowerCase();
  const scored: { e: SearchEntry; s: number }[] = [];
  for (const e of index) {
    const n = e.n.toLowerCase();
    let s = 0;
    if (n === q) s = 1000;
    else if (n.startsWith(q)) s = 700 - n.length; // shorter names first
    else continue;
    scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, 6).map(({ e }) => ({
    name: e.n,
    glyph: e.v,
    scheme: e.sc[0] ?? "unicode",
  }));
}

function completeCodepoint(index: SearchEntry[], hex: string): PopItem[] {
  const cp = parseInt(hex, 16);
  if (!Number.isFinite(cp)) return [];
  const e = index.find((x) => x.c === cp);
  return e ? [{ name: e.u ?? e.n, glyph: e.v, scheme: "unicode" }] : [];
}

function rowColOf(value: string, caret: number) {
  const upto = value.slice(0, caret);
  const nl = upto.lastIndexOf("\n");
  return { row: (upto.match(/\n/g) ?? []).length, col: caret - (nl + 1) };
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    const raf = requestAnimationFrame(on); // defer initial read out of effect body
    return () => {
      mq.removeEventListener("change", on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return reduce;
}

type Layout = { codeTop: number; codeLeft: number; codeH: number; wrapW: number };

// ─── component ─────────────────────────────────────────────────────────────
export function HeroDemo() {
  const reduce = usePrefersReducedMotion();
  const listId = React.useId();
  const frames = React.useMemo(() => buildFrames(), []);
  const finalValue = frames[frames.length - 1].value;

  const [mode, setMode] = React.useState<"demo" | "live">("demo");
  const [value, setValue] = React.useState("");
  const [caret, setCaret] = React.useState(0);
  const [demoPop, setDemoPop] = React.useState<Pop | null>(null);
  const [sel, setSel] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const [index, setIndex] = React.useState<SearchEntry[] | null>(null);

  const [ch, setCh] = React.useState(FONT_SIZE * 0.6);
  const [layout, setLayout] = React.useState<Layout>({
    codeTop: 1,
    codeLeft: GUTTER + 1,
    codeH: 288,
    wrapW: 400,
  });

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const codeRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLSpanElement>(null);
  const modeRef = React.useRef<"demo" | "live">("demo");
  const blurTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const caretApply = React.useRef<number | null>(null);

  // Preload the index so the first keystroke completes instantly.
  React.useEffect(() => {
    loadSearchIndex().then(setIndex);
  }, []);

  // Measure the char width + the code column's geometry within the wrapper. All
  // setState runs from callbacks (rAF / ResizeObserver), never in the effect body.
  React.useLayoutEffect(() => {
    const measure = () => {
      if (measureRef.current)
        setCh(measureRef.current.getBoundingClientRect().width / 20);
      const codeEl = codeRef.current;
      const wrapEl = wrapperRef.current;
      if (codeEl && wrapEl) {
        const c = codeEl.getBoundingClientRect();
        const w = wrapEl.getBoundingClientRect();
        setLayout({
          codeTop: c.top - w.top,
          codeLeft: c.left - w.left,
          codeH: codeEl.clientHeight,
          wrapW: wrapEl.clientWidth,
        });
      }
    };
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    if (codeRef.current) ro.observe(codeRef.current);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // The demo player. Runs only in demo mode; resets to a blank frame when it
  // (re)starts, and honours reduced-motion by showing the finished proof.
  React.useEffect(() => {
    if (mode !== "demo") return;
    let timer: ReturnType<typeof setTimeout>;
    if (reduce) {
      timer = setTimeout(() => {
        setValue(finalValue);
        setCaret(finalValue.length);
        setDemoPop(null);
      }, 0);
      return () => clearTimeout(timer);
    }
    let i = 0;
    const step = () => {
      const f = frames[i];
      setValue(f.value);
      setCaret(f.caret);
      setDemoPop(f.pop);
      i = (i + 1) % frames.length;
      timer = setTimeout(step, f.delay);
    };
    timer = setTimeout(step, 0); // kick off outside the effect body
    return () => clearTimeout(timer);
  }, [mode, reduce, frames, finalValue]);

  // Apply a programmatic caret (after accepting a completion).
  React.useLayoutEffect(() => {
    if (modeRef.current === "live" && caretApply.current != null && taRef.current) {
      const p = caretApply.current;
      taRef.current.selectionStart = taRef.current.selectionEnd = p;
      caretApply.current = null;
    }
  });

  const enterLive = React.useCallback(() => {
    if (modeRef.current === "live") return;
    modeRef.current = "live";
    clearTimeout(blurTimer.current);
    setMode("live");
    setDemoPop(null);
    setValue("");
    setCaret(0);
    setSel(0);
    setDismissed(false);
    requestAnimationFrame(() => taRef.current?.focus());
  }, []);

  const enterDemo = React.useCallback(() => {
    if (modeRef.current === "demo") return;
    modeRef.current = "demo";
    setMode("demo");
    setDismissed(false);
  }, []);

  // Live completions from the real index (prefix on \, or a U+ code point).
  const livePop = React.useMemo<Pop | null>(() => {
    if (mode !== "live" || dismissed || !index) return null;
    const upto = value.slice(0, caret);
    const m = /\\([A-Za-z0-9.+]*)$/.exec(upto);
    if (m && m[1].length >= 1) {
      const items = completeMacro(index, m[1]);
      return items.length
        ? { items, query: m[1], trigger: "\\", start: caret - m[0].length }
        : null;
    }
    const u = /U\+([0-9a-fA-F]{2,})$/.exec(upto);
    if (u) {
      const items = completeCodepoint(index, u[1]);
      return items.length
        ? { items, query: u[1], trigger: "U+", start: caret - u[0].length }
        : null;
    }
    return null;
  }, [mode, dismissed, index, value, caret]);

  const pop = mode === "demo" ? demoPop : livePop;
  const selected = mode === "live" ? sel : 0;

  function acceptItem(p: Pop, idx: number) {
    const item = p.items[idx] ?? p.items[0];
    const before = value.slice(0, p.start);
    const after = value.slice(caret);
    const next = before + item.glyph + after;
    caretApply.current = before.length + item.glyph.length;
    setValue(next);
    setCaret(caretApply.current);
    setSel(0);
    setDismissed(false);
  }

  const { row, col } = rowColOf(value, caret);
  const caretTop = PAD_T + row * LINE_H;
  const caretLeft = col * ch;

  // Pop-up geometry, in wrapper coordinates. Width caps to the panel; it sits
  // below the caret, but flips above when it would overflow the editor body —
  // so it is never clipped or truncated.
  const rows = pop ? Math.min(pop.items.length, 6) : 0;
  const popupH = 10 + rows * 30;
  const popW = Math.min(POP_W, layout.wrapW - 12);
  const below = caretTop + LINE_H + 6;
  const above = caretTop - popupH - 6;
  const flip = below + popupH > layout.codeH && above >= 0;
  const popTop = layout.codeTop + (flip ? above : below);
  const popLeft = clamp(
    layout.codeLeft + caretLeft,
    6,
    Math.max(6, layout.wrapW - popW - 6),
  );

  const lineCount = value.length ? value.split("\n").length : 1;
  const bodyMinH = PAD_T + LINE_H * 8 + 8; // fits the 7-line demo, no jump

  const textStyle: React.CSSProperties = {
    fontFamily: CODE_FONT,
    fontSize: FONT_SIZE,
    lineHeight: `${LINE_H}px`,
    tabSize: 2,
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Panel variant="glow" markers className="overflow-hidden">
        {/* code area */}
        <div
          className="relative flex"
          style={{ minHeight: bodyMinH }}
          onPointerDown={enterLive}
        >
          {/* gutter */}
          <div
            aria-hidden
            className="shrink-0 select-none text-right text-ink-faint"
            style={{
              width: GUTTER,
              paddingTop: PAD_T,
              paddingRight: 12,
              ...textStyle,
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} style={{ height: LINE_H }}>
                {i + 1}
              </div>
            ))}
          </div>

          {/* code column */}
          <div ref={codeRef} className="relative flex-1 overflow-hidden">
            {/* hidden width probe (20 chars) */}
            <span
              ref={measureRef}
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 opacity-0"
              style={{ ...textStyle, whiteSpace: "pre" }}
            >
              00000000000000000000
            </span>

            <pre
              aria-hidden
              className="m-0 overflow-hidden"
              style={{
                ...textStyle,
                paddingTop: PAD_T,
                paddingRight: 14,
                minHeight: bodyMinH,
                whiteSpace: "pre",
                color: "var(--code-variable)",
              }}
            >
              <Highlighted src={value} />
            </pre>

            <textarea
              ref={taRef}
              value={value}
              readOnly={mode !== "live"}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              aria-label="Try unikodo — type a macro such as \le or \alpha"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={mode === "live" && !!livePop}
              aria-controls={listId}
              aria-activedescendant={
                mode === "live" && livePop ? `${listId}-opt-${sel}` : undefined
              }
              className="absolute inset-0 block h-full w-full resize-none border-0 bg-transparent outline-none"
              style={{
                ...textStyle,
                padding: `${PAD_T}px 14px 0 0`,
                color: "transparent",
                caretColor: "var(--color-ink)",
                whiteSpace: "pre",
                overflow: "hidden",
              }}
              onChange={(e) => {
                setValue(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setSel(0);
                setDismissed(false);
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? caret)}
              onFocus={enterLive}
              onBlur={() => {
                clearTimeout(blurTimer.current);
                blurTimer.current = setTimeout(enterDemo, 1600);
              }}
              onKeyDown={(e) => {
                if (mode !== "live") return;
                if (!livePop || !livePop.items.length) return;
                const n = livePop.items.length;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSel((s) => (s + 1) % n);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSel((s) => (s - 1 + n) % n);
                } else if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  acceptItem(livePop, sel);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissed(true);
                }
              }}
            />

            {/* placeholder for the empty live editor */}
            {mode === "live" && value === "" && (
              <span
                aria-hidden
                className="pointer-events-none absolute text-ink-faint"
                style={{ left: 0, top: PAD_T, ...textStyle, whiteSpace: "pre" }}
              >
                {"Type \\ then a name — e.g. \\le, \\alpha, \\BbbR"}
              </span>
            )}

            {/* faux caret while the demo is playing */}
            {mode === "demo" && !reduce && (
              <span
                aria-hidden
                className="pointer-events-none absolute animate-pulse bg-ink"
                style={{
                  left: caretLeft,
                  top: caretTop + (LINE_H - 16) / 2,
                  width: 1.5,
                  height: 16,
                }}
              />
            )}
          </div>
        </div>

        {/* status bar — language, bottom-right */}
        <div className="flex items-center justify-end border-t border-wire-subtle px-4 py-1.5">
          <span className="text-[11px] text-ink-faint">lambdapi</span>
        </div>
      </Panel>

      {/* completion pop-up — sibling of the panel, so it is never clipped */}
      {pop && pop.items.length > 0 && (
        <div
          aria-hidden={mode !== "live"}
          className={cn(
            "absolute z-20 overflow-hidden rounded-sm border border-wire-bright bg-overlay shadow-[0_18px_50px_rgba(0,0,0,0.6)]",
            mode !== "live" && "pointer-events-none",
          )}
          style={{ top: popTop, left: popLeft, width: popW }}
        >
          <ul id={listId} role="listbox" className="py-1 text-[12.5px]">
            {pop.items.map((it, idx) => (
              <li
                key={`${it.name}-${idx}`}
                id={`${listId}-opt-${idx}`}
                role="option"
                aria-selected={idx === selected}
                onMouseDown={(e) => {
                  if (mode !== "live") return;
                  e.preventDefault();
                  acceptItem(pop, idx);
                }}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-1.5",
                  mode === "live" && "cursor-pointer",
                  idx === selected && "bg-elevated",
                )}
              >
                <Glyph
                  value={it.glyph}
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-[3px] border bg-surface text-[15px] text-ink",
                    idx === selected ? "border-wire-bright" : "border-wire-subtle",
                  )}
                />
                <span className="flex-1 truncate">
                  <span className="text-ink-faint">{pop.trigger}</span>
                  <NameHint name={it.name} query={pop.query} />
                </span>
                <span className="label-caps shrink-0">{it.scheme}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NameHint({ name, query }: { name: string; query: string }) {
  const q = query.toLowerCase();
  if (q && name.toLowerCase().startsWith(q)) {
    return (
      <>
        <span className="text-ink">{name.slice(0, query.length)}</span>
        <span className="text-ink-secondary">{name.slice(query.length)}</span>
      </>
    );
  }
  return <span className="text-ink-secondary">{name}</span>;
}
