"use client";

// Marketing navigation — a client island inside the server-rendered pages.
// Real <Link> navigation (crawlable, prefetchable), pathname-derived active
// state, and a mobile disclosure with Escape/scroll-lock hygiene.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Icon,
  LogoLockup,
  Skeleton,
  ThemeToggle,
  cn,
} from "@/components/fs";
import { NAV } from "./content";
import { api, type SessionState } from "@/lib/client/api";

/**
 * Session-aware CTA.
 *
 * Public pages render signed-out controls on the server; this island swaps in
 * "Open platform" once a live session confirms. A skeleton holds the space
 * while resolving so the button never flashes the wrong action.
 */
function AuthActions() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<SessionState>("/api/v1/auth/session"),
    staleTime: 60_000,
  });

  if (session.isLoading) {
    return <Skeleton className="hidden h-8 w-40 sm:block" />;
  }

  if (session.data?.authenticated === true) {
    return (
      <Button asChild size="sm">
        <Link href="/discover">Open platform</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="link" size="sm">
        <Link href="/auth?mode=login">Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/auth">Request access</Link>
      </Button>
    </div>
  );
}

export function MarketingNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Close on Escape and lock background scroll while the panel is open.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const items = [...NAV, { label: "Contact", href: "/contact" }];

  return (
    <header className="fs-glass fs-safe-top sticky top-0 z-30 border-b border-[var(--fs-border)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/" aria-label="FoundrySignal home" className="fs-press shrink-0">
          <LogoLockup size={24} />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "fs-press rounded-md px-3 py-1.5 text-sm transition-colors duration-fast ease-out",
                  active ? "bg-surface-3 font-medium text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-1.5 lg:flex">
          <ThemeToggle size="sm" />
          <AuthActions />
        </div>

        {/* Mobile controls */}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <ThemeToggle size="sm" />
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="fs-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="fs-touch fs-press inline-flex items-center justify-center rounded-md text-ink-muted hover:text-ink"
          >
            <Icon name={menuOpen ? "close" : "menu"} size={20} />
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      <div
        id="fs-mobile-menu"
        hidden={!menuOpen}
        className="border-t border-[var(--fs-border)] bg-bg lg:hidden"
      >
        <nav aria-label="Primary mobile" className="mx-auto flex max-w-6xl flex-col gap-0.5 px-4 py-3">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "fs-press flex min-h-[44px] items-center rounded-md px-3 text-sm transition-colors duration-fast ease-out",
                  active ? "bg-surface-3 font-medium text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          <div className="mt-2 flex flex-col gap-2 border-t border-[var(--fs-border)] pt-3">
            <AuthActions />
          </div>
        </nav>
      </div>
    </header>
  );
}