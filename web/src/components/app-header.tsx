"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GithubLogo, SquaresFour } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { UnikodoMark } from "@/components/unikodo-mark";
import { ThemeToggle } from "@/components/theme-toggle";

const REPO_URL = "https://github.com/Deducteam/unikodo";

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-wire bg-[color-mix(in_srgb,var(--andromeda-surface-base)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        {/* Logo → home */}
        <Link
          href="/"
          aria-label="unikodo — home"
          className="flex shrink-0 items-center text-ink"
        >
          <UnikodoMark className="text-[22px]" />
        </Link>

        <div className="flex-1" />

        <nav className="flex items-center gap-1">
          <Link
            href="/browse"
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-[13px] transition-colors hover:bg-elevated",
              pathname?.startsWith("/browse") || pathname?.startsWith("/symbol")
                ? "text-ink"
                : "text-ink-secondary hover:text-ink",
            )}
          >
            <SquaresFour size={16} />
            <span className="hidden md:inline">Browse</span>
          </Link>
          <ThemeToggle />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="unikodo on GitHub"
            className="grid size-9 place-items-center rounded-sm text-ink-secondary transition-colors hover:bg-elevated hover:text-ink"
          >
            <GithubLogo size={18} />
          </a>
        </nav>
      </div>
    </header>
  );
}
