import * as React from "react";

import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/andromeda/panel";
import { CopyButton } from "@/components/copy-button";

// A titled code panel with a copy button. Server component; the copy control
// is the only client island.
export function CodeBlock({
  label,
  code,
  copyValue,
  className,
}: {
  label?: string;
  code: React.ReactNode;
  /** Raw text to copy (defaults to `code` when it is a string). */
  copyValue?: string;
  className?: string;
}) {
  const copyText =
    copyValue ?? (typeof code === "string" ? code : undefined);
  return (
    <Panel className={cn("overflow-hidden", className)}>
      {label && (
        <PanelHeader title={label}>
          {copyText !== undefined && <CopyButton value={copyText} />}
        </PanelHeader>
      )}
      <pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-relaxed text-ink-secondary">
        <code>{code}</code>
      </pre>
    </Panel>
  );
}
