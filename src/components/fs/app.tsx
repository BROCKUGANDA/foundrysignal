"use client";

// FoundrySignal root — session bootstrapping and URL-driven section routing.
// The URL is the source of truth: deep links, refresh, and back/forward all
// work; unknown paths render the branded 404 instead of a framework error.

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AccountState, type SessionState } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { pathToSection, titleForSection } from "@/lib/client/routes";
import { AuthView } from "@/components/fs/auth-view";
import { AppShell } from "@/components/fs/app-shell";
import { DiscoverView } from "@/components/fs/discover-view";
import { NotFoundView } from "@/components/fs/not-found-view";
import { BootSplash, LoadingState, OfflineState } from "@/components/fs";
import { useWalletAvailability } from "@/lib/client/wallet";
import { TradingView } from "@/components/fs/trading-surface-view";

// Heavy views load on demand — keeps the first bundle to the shell plus the
// two views a new session can reach (auth, discover).
const DossierView = dynamic(
  () => import("@/components/fs/dossier-view").then((m) => ({ default: m.DossierView })),
  { loading: () => <LoadingState rows={4} kind="card" label="Loading dossier" /> },
);
const ResearchView = dynamic(
  () => import("@/components/fs/research-view").then((m) => ({ default: m.ResearchView })),
  { loading: () => <LoadingState rows={4} label="Loading AI analyst" /> },
);
const WatchlistsView = dynamic(
  () => import("@/components/fs/watchlists-view").then((m) => ({ default: m.WatchlistsView })),
  { loading: () => <LoadingState rows={3} label="Loading watchlists" /> },
);
const MarketsView = dynamic(
  () => import("@/components/fs/markets-view").then((m) => ({ default: m.MarketsView })),
  { loading: () => <LoadingState rows={3} label="Loading markets" /> },
);
const SettingsView = dynamic(
  () => import("@/components/fs/settings-view").then((m) => ({ default: m.SettingsView })),
  { loading: () => <LoadingState rows={3} label="Loading settings" /> },
);
const DesignSystemView = dynamic(
  () => import("@/components/fs/design-system-view").then((m) => ({ default: m.DesignSystemPlayground })),
  { loading: () => <LoadingState rows={3} label="Loading design system" /> },
);
const AdminView = dynamic(
  () => import("@/components/fs/admin-view").then((m) => ({ default: m.AdminView })),
  { loading: () => <LoadingState rows={3} label="Loading administration" /> },
);

/* ─── 404 bridge ────────────────────────────────────────────────────── */

function NotFoundBridge({ pathname }: { pathname: string }) {
  React.useEffect(() => {
    document.title = "Page not found · FoundrySignal";
  }, []);
  return <NotFoundView path={pathname} />;
}

/* ─── Offline banner ────────────────────────────────────────────────── */

/**
 * Global connectivity banner. Uses the shared OfflineState styling but stays
 * pinned to the viewport, above the mobile tab bar and clear of the home
 * indicator.
 */
function OfflineBanner() {
  const [online, setOnline] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Coming back online clears any manual dismissal, so the next drop is shown.
  React.useEffect(() => {
    if (online) setDismissed(false);
  }, [online]);

  if (online || dismissed) return null;

  return (
    <div
      className="fs-offline-banner fs-safe-bottom fixed inset-x-0 z-40 px-3"
      role="status"
      aria-live="polite"
    >
      <OfflineState onDismiss={() => setDismissed(true)} className="mx-auto max-w-3xl shadow-e3" />
    </div>
  );
}

/* ─── Router ────────────────────────────────────────────────────────── */

function FoundrySignalRouter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useApp((s) => s.params);
  const navigate = useApp((s) => s.navigate);
  const syncRoute = useApp((s) => s.syncRoute);
  const qc = useQueryClient();
  const [account, setAccount] = React.useState<AccountState | null>(null);
  useWalletAvailability();

  // URL → section, synchronously, so a deep link paints the right view on the
  // first frame instead of flashing the default.
  const match = React.useMemo(
    () => pathToSection(pathname ?? "/", searchParams?.toString() ?? ""),
    [pathname, searchParams],
  );

  React.useEffect(() => {
    if (match) syncRoute(match.section, match.params);
  }, [match, syncRoute]);

  React.useEffect(() => {
    if (!match) return;
    document.title =
      match.section === "dossier"
        ? "Venture dossier · FoundrySignal"
        : `${titleForSection(match.section)} · FoundrySignal`;
  }, [match]);

  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<SessionState>("/api/v1/auth/session"),
    staleTime: 60_000,
  });

  const authenticated = session.data?.authenticated === true;

  // Account details load once a session is confirmed. A failure here is not
  // fatal — the app falls back to the auth flow rather than a blank screen.
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => api.get<AccountState>("/api/v1/account"),
    enabled: authenticated,
    retry: false,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (accountQuery.data) setAccount(accountQuery.data);
  }, [accountQuery.data]);

  // Session expiry surfaced by the API client → honest re-auth, not a stuck
  // error state on whatever view the user was on.
  React.useEffect(() => {
    const onUnauthorized = () => {
      setAccount(null);
      qc.invalidateQueries({ queryKey: ["session"] });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      navigate("auth");
    };
    window.addEventListener("fs:unauthorized", onUnauthorized);
    return () => window.removeEventListener("fs:unauthorized", onUnauthorized);
  }, [qc, navigate]);

  const onAuthenticated = React.useCallback(
    (next: AccountState) => {
      setAccount(next);
      qc.invalidateQueries();
      navigate("discover");
    },
    [qc, navigate],
  );

  const onLogout = React.useCallback(async () => {
    await api.post("/api/v1/auth/logout").catch(() => undefined);
    setAccount(null);
    qc.clear();
    navigate("home");
  }, [qc, navigate]);

  // Unknown URL → branded 404, ahead of the session gate so a mistyped link
  // never demands a login.
  if (!match) return <NotFoundBridge pathname={pathname ?? "/"} />;

  // The design-system playground is a public surface (like marketing and the
  // 404): it renders no user data, so there is nothing to authorize.
  if (match.section === "design-system") return <DesignSystemView />;

  const booting = session.isLoading || (authenticated && accountQuery.isLoading);

  if (booting) {
    return <BootSplash label="Starting FoundrySignal" hint="Restoring your session" />;
  }

  if (!account) {
    return (
      <>
        <OfflineBanner />
        <AuthView onAuthenticated={onAuthenticated} />
      </>
    );
  }

  return (
    <>
      <OfflineBanner />
      <AppShell account={account} onLogout={onLogout} alertCount={0}>
        {(match.section === "discover" ||
          match.section === "home" ||
          (match.section === "auth" && account)) && (
          <DiscoverView account={account} />
        )}
        {match.section === "dossier" && match.params.slug ? (
          <DossierView slug={match.params.slug} />
        ) : null}
        {match.section === "research" ? (
          <ResearchView
            ventureId={match.params.venture ?? params.venture}
            runId={match.params.run ?? params.run}
          />
        ) : null}
        {match.section === "watchlists" ? <WatchlistsView /> : null}
        {match.section === "markets" ? <MarketsView /> : null}
        {match.section === "trade" ? <TradingView /> : null}
        {match.section === "settings" ? (
          <SettingsView account={account} onAccountRefresh={setAccount} />
        ) : null}
        {match.section === "admin" ? <AdminView platformRole={account.platformRole} /> : null}
      </AppShell>
    </>
  );
}

export function FoundrySignalApp() {
  return (
    <React.Suspense fallback={<BootSplash label="Starting FoundrySignal" />}>
      <FoundrySignalRouter />
    </React.Suspense>
  );
}