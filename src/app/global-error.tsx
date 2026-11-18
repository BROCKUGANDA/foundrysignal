"use client";

// Global error boundary — last resort when the root layout itself throws.
// Minimal self-contained markup (layout CSS may be unavailable).

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#080B12", color: "#E7ECF4", margin: 0 }}>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 600 }}>FoundrySignal hit a critical error</h1>
          <p style={{ fontSize: "13px", color: "#9AA7B8", maxWidth: 420, lineHeight: 1.6 }}>
            The application shell failed to start. Reload the page to recover.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            onClick={reset}
            style={{ marginTop: 20, padding: "8px 16px", fontSize: 13, borderRadius: 8, border: "1px solid #2A3242", background: "#11151F", color: "#E7ECF4", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
