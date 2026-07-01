import { Panel, PanelHeader } from "@/components/andromeda/panel";
import { Tag } from "@/components/andromeda/tag";
import { SchemeBadge } from "@/components/scheme-badge";
import { CopyButton } from "@/components/copy-button";
import { SCHEMES } from "@/lib/schemes";
import { CLASS_LABELS, type CharacterEntry } from "@/lib/symbols";

interface Row {
  key: string;
  scheme: string;
  trigger: string;
  name: string;
  copy: string;
  cls: string | null;
}

export function WaysToType({ entry }: { entry: CharacterEntry }) {
  const rows: Row[] = entry.names.map((n) => {
    const trigger = SCHEMES[n.scheme as keyof typeof SCHEMES]?.trigger ?? "";
    return {
      key: `${n.scheme}:${n.name}`,
      scheme: n.scheme,
      trigger,
      name: n.name,
      copy: trigger + n.name,
      cls: n.class,
    };
  });

  // The dynamic `unicode` scheme can name any single code point by hex.
  if (entry.codepoints.length === 1) {
    const hex = entry.codepoint.toString(16).toUpperCase().padStart(4, "0");
    rows.push({
      key: "unicode",
      scheme: "unicode",
      trigger: "U+",
      name: hex,
      copy: `U+${hex}`,
      cls: null,
    });
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Names">
        <span className="text-[11px] tabular-nums text-ink-faint">
          {rows.length} {rows.length === 1 ? "name" : "names"}
        </span>
      </PanelHeader>

      <ul className="divide-y divide-wire-subtle">
        {rows.map((r) => (
          <li
            key={r.key}
            className="grid grid-cols-[140px_1fr_auto] items-center gap-3 px-4 py-2.5"
          >
            <SchemeBadge scheme={r.scheme} className="w-fit" />

            <code className="truncate text-[14px]">
              <span className="text-ink-faint">{r.trigger}</span>
              <span className="text-ink">{r.name}</span>
            </code>

            <div className="flex items-center gap-2">
              {r.cls && CLASS_LABELS[r.cls] && (
                <Tag tone="outline" className="hidden sm:inline-flex">
                  {CLASS_LABELS[r.cls]}
                </Tag>
              )}
              <CopyButton value={r.copy} iconSize={13} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
