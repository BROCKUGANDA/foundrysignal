"use client";

// Wallet Standard integration (@wallet-standard/app) — detects installed
// Wallet Standard wallets honestly. No wallets in the preview environment →
// explicit "no wallets detected" state. Wallet names/claims are data from
// the wallets themselves; the platform never fabricates wallet availability.
//
// Detection is a single process-wide source of truth: one registry listener
// feeds every consumer (app shell, markets, trading). Multiple components
// subscribe to the same snapshot instead of each spinning up its own dynamic
// import + listener, which previously produced duplicate detection and
// repeated connect prompts.

import { useSyncExternalStore } from "react";
import type { Wallet } from "@wallet-standard/base";

export interface WalletAvailability {
  wallets: readonly Wallet[];
  checked: boolean;
}

type Listener = () => void;

const EMPTY_SNAPSHOT: WalletAvailability = { wallets: [], checked: false };

let snapshot: WalletAvailability = EMPTY_SNAPSHOT;
const listeners = new Set<Listener>();
let started = false;

function emit(next: WalletAvailability) {
  snapshot = next;
  for (const l of listeners) l();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  (async () => {
    try {
      // Dynamic import is deliberate: @wallet-standard/app touches window at
      // module scope, so it must never be evaluated during SSR.
      const { getWallets } = await import("@wallet-standard/app");
      const walletsApi = getWallets();
      // Wallets is a registry class — use .get(); it has no Array methods.
      const update = () => emit({ wallets: walletsApi.get(), checked: true });
      update();
      walletsApi.on("register", update);
      walletsApi.on("unregister", update);
    } catch {
      emit({ wallets: [], checked: true });
    }
  })();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  start();
  // The registry listener is intentionally kept alive for the app lifetime
  // once started, so wallets registering after the first subscriber are seen.
  return () => listeners.delete(listener);
}

export function useWalletAvailability(): WalletAvailability {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY_SNAPSHOT,
  );
}

// Trading execution is gated server-side by the release-gate system
// (/api/v1/trading/gates) — the server is the single source of truth.
// This constant only mirrors the default posture for pre-hydration UI.
export const TRADING_GATE = {
  enabled: false,
  note: "Execution disabled pending product, jurisdiction, provider and security review.",
};
