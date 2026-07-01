"use client";

import * as React from "react";
import { Moon, Sun } from "@phosphor-icons/react";

// The theme lives on <html data-theme>, set before paint by the layout's inline
// script (stored preference, else the OS prefers-color-scheme). We read it as an
// external store so SSR ("dark") and the client stay in sync without a
// setState-in-effect or a hydration mismatch, and re-render when we flip it.
const EVENT = "unikodo:themechange";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function getTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const theme = React.useSyncExternalStore(
    subscribe,
    getTheme,
    () => "dark" as const,
  );

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      className="grid size-9 place-items-center rounded-sm text-ink-secondary transition-colors hover:bg-elevated hover:text-ink cursor-pointer"
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
