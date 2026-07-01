import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { SiteBackground } from "@/components/site-background";
import { AppHeader } from "@/components/app-header";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

// Runs before first paint: apply the stored theme, or fall back to the OS
// preference, by setting data-theme on <html>. Avoids a flash of the wrong
// palette and keeps the header toggle authoritative once used.
const THEME_INIT = `(function(){try{var d=document.documentElement,t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}d.dataset.theme=t;}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: "unikodo — flexible and friendly Unicode tooling",
    template: "%s · unikodo",
  },
  description:
    "Browse the Unicode (math) symbols unikodo can name for you — across the unicode-math, LaTeX, Typst, ASCII, and code-point naming schemes.",
  applicationName: "unikodo",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jetbrainsMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <SiteBackground />
        <AppHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
