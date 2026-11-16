"use client";

// Wallet Standard integration (@wallet-standard/app) — detects installed
// Wallet Standard wallets honestly. No wallets in the preview environment →
// explicit "no wallets detected" state. Wallet names/claims are data from
// the wallets themselves; the platform never fabricates wallet availability.

import { useEffect, useState } from "react";
import type { Wallet } from "@wallet-standard/base";

export interface WalletAvailability {
  wallets: readonly Wallet[];
  checked: boolean;
}

export function useWalletAvailability(): WalletAvailability {
  const [state, setState] = useState<WalletAvailability>({ wallets: [], checked: false });
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const { getWallets } = await import("@wallet-standard/app");
        const walletsApi = getWallets();
        const update = () => {
          // Wallets is a registry class — use .get(); it has no Array methods.
          if (!cancelled) setState({ wallets: walletsApi.get(), checked: true });
        };
        update();
        const offRegister = walletsApi.on("register", update);
        const offUnregister = walletsApi.on("unregister", update);
        cleanup = () => {
          offRegister();
          offUnregister();
        };
      } catch {
        if (!cancelled) setState({ wallets: [], checked: true });
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
  return state;
}

// Trading execution is gated server-side by the release-gate system
// (/api/v1/trading/gates) — the server is the single source of truth.
// This constant only mirrors the default posture for pre-hydration UI.
export const TRADING_GATE = {
  enabled: false,
  note: "Execution disabled pending product, jurisdiction, provider and security review.",
};
