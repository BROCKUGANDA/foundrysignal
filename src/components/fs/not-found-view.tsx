"use client";

// Branded 404 — full-page, standalone (works outside the app shell too).
// Offers sensible destinations instead of a dead end.

import React from "react";
import { Button, Glyph, Icon, LogoLockup, SignalPrism } from "@/components/fs";
import { useApp } from "@/lib/client/store";

export function NotFoundView({ path }: { path?: string | null }) {
  const navigate = useApp((s) => s.navigate);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <LogoLockup size={28} />

      <div className="mt-10 flex size-12 items-center justify-center rounded-lg bg-surface-3 text-ink-muted" aria-hidden="true">
        <Glyph name="research" size={22} />
      </div>

      <p className="fs-data mt-6 text-5xl font-bold tracking-tight text-ink">404</p>
      <h1 className="fs-brand mt-2 text-lg font-semibold text-ink">Page not found</h1>
      <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-muted">
        {path ? (
          <>
            No page lives at <span className="fs-data break-all text-ink-secondary">{path}</span>.
          </>
        ) : (
          "The page you requested does not exist."
        )}{" "}
        It may have been moved, or the link may be malformed. Every published marketing page and platform view is reachable
        from the navigation below.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => navigate("home")}>
          <Icon name="chevronRight" size={13} className="rotate-180" />
          Back to home
        </Button>
        <Button variant="outline" onClick={() => navigate("discover")}>
          Explore ventures
        </Button>
        <Button variant="outline" onClick={() => navigate("pricing")}>
          Pricing
        </Button>
        <Button variant="ghost" onClick={() => navigate("contact")}>
          Contact
        </Button>
      </div>

      <div className="mt-14 opacity-50" aria-hidden="true">
        <SignalPrism size={120} />
      </div>
    </div>
  );
}
