import { cn } from "@/lib/utils";

// L-shaped brackets that hug each corner — an Andromeda signature. Purely
// decorative; sits inside a `relative` parent.
export function CornerMarkers({
  className,
  size = 12,
}: {
  className?: string;
  size?: number;
}) {
  const common = "pointer-events-none absolute";
  const style = { width: size, height: size };
  const stroke =
    className ?? "border-[var(--andromeda-border-bright)]";
  return (
    <>
      <span className={cn(common, "left-0 top-0 border-l border-t", stroke)} style={style} />
      <span className={cn(common, "right-0 top-0 border-r border-t", stroke)} style={style} />
      <span className={cn(common, "left-0 bottom-0 border-l border-b", stroke)} style={style} />
      <span className={cn(common, "right-0 bottom-0 border-r border-b", stroke)} style={style} />
    </>
  );
}
