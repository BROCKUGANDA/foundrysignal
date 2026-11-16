"use client";

// Global error boundary — last resort when the root layout itself throws.
// Self-contained markup (layout CSS may be unavailable). It reports the
// failure honestly, keeps the reference digest for support, and performs one
// bounded cache-busted retry so a stale cached document can heal itself.

import * as React from "react";
import { recoveryUrl, RECOVERY_STORAGE_KEY } from "@/components/fs/asset-recovery";

const GLOBAL_RECOVERY_KEY = `${RECOVERY_STORAGE_KEY}:global`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(GLOBAL_RECOVERY_KEY) === "1";
    } catch {
      // storage can be unavailable; skip the automatic retry in that case
    }
    if (alreadyTried) return;

    try {
      sessionStorage.setItem(GLOBAL_RECOVERY_KEY, "1");
    } catch {
      return;
    }
    const timer = window.setTimeout(() => {
      window.location.replace(recoveryUrl(window.location.href));
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#080B12",
          color: "#E7ECF4",
          margin: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "18px", fontWeight: 600 }}>
            We couldn&apos;t start that page
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "#9AA7B8",
              maxWidth: 420,
              lineHeight: 1.6,
            }}
          >
            Something interrupted the page while it was loading. A fresh copy is
            being requested automatically — if that doesn&apos;t help, use the
            button below.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem(GLOBAL_RECOVERY_KEY);
              } catch {
                // non-fatal
              }
              reset();
            }}
            style={{
              marginTop: 20,
              padding: "8px 16px",
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid #2A3242",
              background: "#11151F",
              color: "#E7ECF4",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
