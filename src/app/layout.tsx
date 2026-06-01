import type { Metadata } from "next";
import localFont from "next/font/local";

import { AppHeader } from "@/components/AppHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { Nav } from "@/components/Nav";
import { Providers } from "@/app/providers";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZooDash — Zoo Code Control Plane",
  description:
    "Operational Intelligence Console de contribución OSS sobre Zoo-Code-Org/Zoo-Code 🦓",
};

// Script sin-FOUC: aplica el tema (dark-first) antes del primer paint.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var c=document.documentElement.classList;if(t==='light'){c.remove('dark');}else if(t==='system'){c.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches);}else{c.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-canvas font-sans text-fg antialiased`}
      >
        <a href="#content" className="skip-link">
          Saltar al contenido
        </a>
        <Providers>
          <CommandPalette />
          <div className="flex min-h-screen">
            <aside className="hidden w-56 shrink-0 flex-col gap-6 border-r border-line bg-surface p-4 sm:flex">
              <div className="px-2">
                <div className="text-lg font-bold tracking-tight text-fg">
                  🦓 ZooDash
                </div>
                <div className="text-xs text-fg-subtle">Control Plane</div>
              </div>
              <Nav />
              {/* TODO(F5): MobileNav (drawer) para <sm; el sidebar se oculta ahí. */}
              <p className="mt-auto px-2 text-[11px] leading-relaxed text-fg-subtle">
                Zoo-Code-Org/Zoo-Code
                <br />
                solo lectura · historiza el snapshot
              </p>
            </aside>
            <main id="content" className="flex-1 overflow-x-hidden px-4 sm:px-8">
              <AppHeader />
              <div className="pb-10">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
