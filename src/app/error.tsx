"use client";

// Route-level error boundary — branded, with a real recovery action and the
// digest for support escalations. Never shows stack traces.

import { Button, Icon, Glyph } from "@/components/fs";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-xl bg-[var(--fs-danger-bg)] text-[var(--fs-danger-fg)]"
      >
        <Glyph name="risk" size={24} />
      </div>

      <h1 className="fs-brand mt-6 text-lg font-semibold text-ink">
        This view failed to render
      </h1>

      <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-muted">
        An unexpected client error occurred. Retrying usually resolves transient
        failures. If it persists, contact support
        {error.digest ? (
          <>
            {" "}
            and include reference <span className="fs-data text-ink-secondary">{error.digest}</span>
          </>
        ) : null}
        .
      </p>

      <Button className="mt-6" onClick={reset}>
        <Icon name="refresh" size={14} />
        Try again
      </Button>
    </div>
  );
}