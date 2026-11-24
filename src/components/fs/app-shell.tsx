"use client";

// Platform shell — sidebar, top bar (search, theme, account), mobile tab bar.
// All chrome consumes the design system; nothing here re-declares a colour or
// a surface recipe.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Input,
  Icon,
  Glyph,
  LogoLockup,
  LogoCompact,
  ThemeToggle,
  ThemeMenuItems,
  Badge,
  Tooltip,
  cn,
  type GlyphName,
} from "@/components/fs";
import { useApp, type Section } from "@/lib/client/store";
import { api, type AccountState, type Capabilities } from "@/lib/client/api";
import { Drawer, DrawerContent } from "@/components/fs/ui/overlay";
import { getRoleWorkspace } from "@/lib/client/role-workspace";

interface NavEntry {
  section: Section;
  label: string;
  glyph: GlyphName;
  /** Secondary label for the account menu. */
  hint?: string;
}

const PLATFORM_NAV: NavEntry[] = [
  { section: "discover", label: "Discover", glyph: "venture", hint: "Venture directory" },
  { section: "research", label: "Analyst", glyph: "research", hint: "Evidence-grounded reports" },
  { section: "watchlists", label: "Watchlists", glyph: "watchlist", hint: "Tracked ventures" },
  { section: "markets", label: "Markets", glyph: "market", hint: "Token and market data" },
];

const ACCOUNT_NAV: NavEntry[] = [{ section: "settings", label: "Settings", glyph: "attestation" }];

export function AppShell({
  account,
  onLogout,
  alertCount,
  children,
}: {
  account: AccountState;
  onLogout: () => void;
  alertCount: number;
  children: React.ReactNode;
}) {
  const section = useApp((s) => s.section);
  const navigate = useApp((s) => s.navigate);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  const [globalQ, setGlobalQ] = React.useState("");
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);

  const caps = useQuery({
    queryKey: ["capabilities"],
    queryFn: () => api.get<Capabilities>("/api/v1/capabilities"),
    staleTime: 60_000,
  });

  const workspace = getRoleWorkspace(account);
  const availableEntries: NavEntry[] = [
    { section: "dashboard", label: "Workspace", glyph: "venture", hint: workspace.title },
    ...PLATFORM_NAV,
    ...ACCOUNT_NAV,
    { section: "admin", label: "Admin", glyph: "risk" },
  ];
  const navEntries = workspace.navigation.flatMap((target) => availableEntries.filter((entry) => entry.section === target));
  const platformEntries = navEntries.filter((entry) => entry.section !== "settings" && entry.section !== "admin");

  // Mobile drawer hygiene: Escape closes, body scroll locks while open.
  React.useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    if (window.innerWidth < 1024) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen, setSidebarOpen]);

  const isActive = (entry: NavEntry) =>
    section === entry.section ||
    (entry.section === "dashboard" && (section === "home" || section === "auth")) ||
    (entry.section === "discover" && section === "dossier");

  const go = (target: Section) => {
    navigate(target);
    setSidebarOpen(false);
    setAccountMenuOpen(false);
  };

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* ── Mobile top bar ─────────────────────────────────────────── */}
      <div
        className="fs-glass fs-safe-top fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-2 border-b border-[var(--fs-border)] px-2 lg:hidden"
      >
        <button
          type="button"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fs-touch fs-press inline-flex items-center justify-center rounded-md text-ink-muted hover:text-ink"
        >
          <Icon name={sidebarOpen ? "close" : "menu"} size={20} />
        </button>
        <button
          type="button"
          onClick={() => go("dashboard")}
          aria-label="FoundrySignal — go to Workspace"
          className="fs-press"
        >
          <LogoCompact size={22} />
        </button>
        <span className="fs-brand hidden text-sm font-semibold text-ink min-[380px]:inline">FoundrySignal</span>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle size="sm" />
          <AccountButton
            account={account}
            onOpen={() => setAccountMenuOpen(true)}
            size="sm"
          />
        </div>
      </div>

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside
        aria-label="Platform navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[var(--fs-border)] bg-bg",
          "transition-transform duration-normal ease-out",
          "lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          sidebarOpen ? "translate-x-0 shadow-e3" : "-translate-x-full",
        )}
      >
        <div className="fs-safe-top flex h-14 shrink-0 items-center px-4">
          <button
            type="button"
            onClick={() => go("dashboard")}
            aria-label="FoundrySignal — go to Workspace"
            className="fs-press"
          >
            <LogoLockup size={24} />
          </button>
        </div>

        <nav className="fs-scroll fs-overscroll-contain flex-1 overflow-y-auto px-2.5 py-2">
          <ul className="flex flex-col gap-0.5">
            {navEntries.map((entry) => {
              const active = isActive(entry);
              return (
                <li key={entry.section}>
                  <button
                    type="button"
                    onClick={() => go(entry.section)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "fs-press flex min-h-[44px] w-full items-center gap-2.5 rounded-md px-3 text-sm",
                      "transition-colors duration-fast ease-out",
                      active
                        ? "bg-surface-3 font-medium text-ink"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Glyph name={entry.glyph} size={16} />
                    {entry.label}
                    {entry.section === "watchlists" && alertCount > 0 ? (
                      <span className="fs-data ml-auto rounded-full bg-[var(--fs-accent)] px-1.5 text-2xs font-semibold text-[var(--fs-accent-contrast)]">
                        {alertCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Workspace + capability status */}
        <div className="shrink-0 px-2.5 pb-2">
          <div className="rounded-lg border border-[var(--fs-border)] bg-surface-2 p-3">
            <div className="fs-label">Workspace</div>
            <div className="mt-1 truncate text-xs font-medium text-ink">
              {account.workspaces[0]?.name ?? "—"}
            </div>
            <div className="fs-data mt-0.5 text-2xs text-ink-faint">
              role: {account.workspaceRole.toLowerCase()}
            </div>
          </div>
        </div>

        <div className="fs-safe-bottom shrink-0 border-t border-[var(--fs-border)] px-4 py-3">
          <div className="fs-data text-2xs text-ink-faint">v1 · research deployment</div>
          <div aria-live="polite" className="fs-data text-2xs text-ink-faint">
            trading:{" "}
            {caps.data ? (caps.data.tradingExecution.available ? "enabled" : "gated") : "…"} ·
            billing:{" "}
            {caps.data ? (caps.data.billing.available ? "configured" : "not configured") : "…"}
          </div>
        </div>
      </aside>

      {/* Scrim for the mobile drawer */}
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fs-scrim fixed inset-0 z-30 lg:hidden"
        />
      ) : null}

      {/* ── Main column ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="fs-glass sticky top-0 z-20 hidden h-14 items-center gap-3 border-b border-[var(--fs-border)] px-4 lg:flex">
          <form
            role="search"
            className="relative w-72"
            onSubmit={(event) => {
              event.preventDefault();
              navigate("discover", { q: globalQ });
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            >
              <Icon name="search" size={13} />
            </span>
            <Input
              value={globalQ}
              onChange={(event) => setGlobalQ(event.target.value)}
              placeholder="Search ventures…"
              aria-label="Search ventures"
              type="search"
              size="sm"
              insetStart={30}
            />
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <Tooltip content="Keyboard shortcuts: press / to search">
              <span className="fs-data hidden rounded border border-[var(--fs-border)] px-1.5 py-0.5 text-2xs text-ink-faint xl:inline-block">
                /
              </span>
            </Tooltip>
            <ThemeToggle />
            <AccountButton
              account={account}
              onOpen={() => setAccountMenuOpen(true)}
              size="md"
            />
          </div>
        </header>

        <main id="fs-main" className="flex-1 px-3 pb-24 pt-16 sm:px-6 lg:pb-8 lg:pt-6">
          <div className="fs-surface-in">{children}</div>
        </main>
      </div>

      {/* ── Mobile tab bar ─────────────────────────────────────────── */}
      <nav
        aria-label="Primary"
        className="fs-glass fs-safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-[var(--fs-border)] lg:hidden"
      >
        {platformEntries.map((entry) => {
          const active = isActive(entry);
          return (
            <button
              key={entry.section}
              type="button"
              onClick={() => go(entry.section)}
              aria-current={active ? "page" : undefined}
              className="fs-press flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 pt-1.5"
              style={{ color: active ? "var(--fs-accent-fg)" : "var(--fs-text-muted)" }}
            >
              <Glyph name={entry.glyph} size={18} />
              <span className="text-2xs font-medium">{entry.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Account menu ───────────────────────────────────────────── */}
      <Drawer open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
        <DrawerContent side="right" title="Account" description={account.email}>
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="fs-data flex size-9 items-center justify-center rounded-full bg-[var(--fs-accent)] text-sm font-bold text-[var(--fs-accent-contrast)]"
                >
                  {(account.name ?? account.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {account.name ?? account.email}
                  </p>
                  <p className="fs-data truncate text-2xs text-ink-faint">
                    {account.platformRole} · {account.workspaceRole}
                  </p>
                </div>
              </div>
              {!account.emailVerified ? (
                <Badge tone="warning" dot>
                  email unverified
                </Badge>
              ) : null}
            </section>

            <nav aria-label="Account" className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => go("settings")}
                className="fs-press flex min-h-[44px] items-center gap-2.5 rounded-md px-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <Glyph name="attestation" size={15} />
                Settings
              </button>
              <button
                type="button"
                onClick={() => go("watchlists")}
                className="fs-press flex min-h-[44px] items-center gap-2.5 rounded-md px-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <Glyph name="watchlist" size={15} />
                Alerts ({alertCount})
              </button>
            </nav>

            <section className="border-t border-[var(--fs-border)] pt-4">
              <ThemeMenuItems as="radio" />
            </section>

            <section className="border-t border-[var(--fs-border)] pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setAccountMenuOpen(false);
                  void onLogout();
                }}
                className="w-full"
              >
                <Icon name="signOut" size={14} />
                Sign out
              </Button>
            </section>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/* ─── Account button ────────────────────────────────────────────────── */

function AccountButton({
  account,
  onOpen,
  size,
}: {
  account: AccountState;
  onOpen: () => void;
  size: "sm" | "md";
}) {
  const initial = (account.name ?? account.email).slice(0, 1).toUpperCase();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Account menu for ${account.name ?? account.email}`}
      aria-haspopup="dialog"
      className={cn(
        "fs-press inline-flex items-center gap-2 rounded-md text-ink-muted",
        "transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-ink",
        size === "sm" ? "size-8 justify-center" : "h-8 px-1.5",
      )}
    >
      <span
        aria-hidden="true"
        className="fs-data flex size-6 items-center justify-center rounded-full bg-[var(--fs-accent)] text-2xs font-bold text-[var(--fs-accent-contrast)]"
      >
        {initial}
      </span>
      {size === "md" ? (
        <span className="hidden max-w-28 truncate text-xs sm:inline">
          {account.name ?? account.email}
        </span>
      ) : null}
    </button>
  );
}