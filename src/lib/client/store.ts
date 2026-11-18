"use client";

// Zustand store: session-render state, URL-synced section navigation, theme.
// The URL is the source of truth for section/params: `navigate` pushes a
// canonical path via the History API (which Next.js App Router syncs with
// usePathname), and FoundrySignalApp re-derives state on popstate and first
// paint so deep links, refresh, and back/forward all work.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sectionToPath } from "@/lib/client/routes";
import type { Section } from "@/lib/client/routes";

// Section is defined in routes.ts (single source of truth for URL mapping)
// and re-exported here for existing imports.
export type { Section };

interface AppState {
  section: Section;
  params: Record<string, string>;
  notFoundPath: string | null;
  theme: "dark" | "light";
  sidebarOpen: boolean;
  reduceMotion: boolean;
  navigate: (section: Section, params?: Record<string, string>) => void;
  /** Sync store from the URL without pushing history (popstate / first paint). */
  syncRoute: (section: Section, params?: Record<string, string>) => void;
  /** Mark the current URL as unknown — renders the branded NotFound view. */
  setNotFound: (path: string) => void;
  setTheme: (t: "dark" | "light") => void;
  setSidebarOpen: (open: boolean) => void;
  setReduceMotion: (v: boolean) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      section: "home",
      params: {},
      notFoundPath: null,
      theme: "dark",
      sidebarOpen: false,
      reduceMotion: false,
      navigate: (section, params = {}) => {
        const path = sectionToPath(section, params);
        if (typeof window !== "undefined" && window.location.pathname + window.location.search !== path) {
          window.history.pushState({}, "", path);
        }
        set({ section, params, notFoundPath: null, sidebarOpen: false });
        if (typeof window !== "undefined") window.scrollTo({ top: 0 });
      },
      syncRoute: (section, params = {}) =>
        set({ section, params, notFoundPath: null, sidebarOpen: false }),
      setNotFound: (path) => set({ notFoundPath: path, sidebarOpen: false }),
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    {
      name: "fs-app",
      partialize: (s) => ({ theme: s.theme, reduceMotion: s.reduceMotion }),
    }
  )
);
