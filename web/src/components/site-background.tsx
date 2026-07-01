// Fixed decorative backdrop: the page void, a faint blueprint lattice, and a
// soft accent bloom from the top — mode-aware (Zedokai yellow / Sun amber).
export function SiteBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-surface">
      <div className="bg-blueprint absolute inset-0 opacity-50" />
      <div
        className="absolute inset-x-0 top-0 h-[460px]"
        style={{
          background:
            "radial-gradient(ellipse 55% 100% at 50% 0%, var(--site-bloom), transparent 72%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--site-hairline), transparent)",
        }}
      />
    </div>
  );
}
