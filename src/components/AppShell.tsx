"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const nav = [
  { href: "/", label: "Dashboard", match: (path: string) => path === "/" },
  { href: "/quotes", label: "Quotes", match: (path: string) => path.startsWith("/quotes") },
  { href: "/templates", label: "Templates", match: (path: string) => path.startsWith("/templates") },
  { href: "/price-lists", label: "Price Lists", match: (path: string) => path.startsWith("/price-lists") },
  { href: "/admin", label: "Admin", match: (path: string) => path.startsWith("/admin") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isQuoteEditor = pathname.startsWith("/quotes/") && pathname !== "/quotes/new";
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="app-container flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
              CA
            </span>
            <span className="text-base font-semibold tracking-tight text-ink sm:text-lg">
              CowAg <span className="text-brand">Quote Helper</span>
            </span>
          </Link>

          {!isQuoteEditor && (
            <>
              <nav className="hidden items-center gap-1 md:flex">
                {nav.map((item) => {
                  const active = item.match(pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx("nav-link", active && "nav-link-active")}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <button
                type="button"
                className="btn-ghost !min-h-0 !px-3 !py-2 md:hidden"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileOpen((open) => !open)}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          )}
        </div>

        {!isQuoteEditor && mobileOpen && (
          <nav className="border-t border-border bg-surface px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {nav.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={clsx("nav-link !rounded-2xl !px-4 !py-3 text-base", active && "nav-link-active")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      <main className="app-container py-6 sm:py-8 lg:py-10">{children}</main>
    </div>
  );
}
