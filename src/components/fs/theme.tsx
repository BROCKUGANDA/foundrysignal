"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./brand/glyphs";

/**
 * Theme system.
 *
 * Replaces the previous arrangement, which was contradictory: `providers.tsx`
 * pinned `forcedTheme="dark"` while `layout.tsx` hard-coded `dark` on <html>
 * and `theme-bridge.tsx` tried to swap classes from the store. The result was
 * a light theme that could never actually take effect.
 *
 * Design:
 *  - One source of truth: `<html class="dark|light" data-theme-mode data-motion>`.
 *  - `mode` is what the user chose: "dark" | "light" | "system".
 *  - `resolved` is what is applied, derived from `mode` + the OS preference.
 *  - Persistence in localStorage under `fs-theme`, mirrored to a cookie so the
 *    server can render the right class on first paint (no flash).
 *  - A blocking inline script in <head> applies the class before first paint.
 *    It is tiny and self-contained; it cannot import this module.
 *
 * Accessibility:
 *  - The toggle is a real button with a state-bearing accessible name.
 *  - Theme changes are announced through `aria-live` so a screen-reader user
 *    knows the surface changed.
 *  - `system` mode keeps listening to the OS even after an explicit choice.
 */

export type ThemeName = "dark" | "light";
export type ThemeMode = ThemeName | "system";

const STORAGE_KEY = "fs-theme";
const MOTION_KEY = "fs-motion";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/* ─── Store ─────────────────────────────────────────────────────────── */

interface ThemeState {
  mode: ThemeMode;
  resolved: ThemeName;
  motionReduced: boolean;
}

const SERVER_SNAPSHOT: ThemeState = { mode: "system", resolved: "dark", motionReduced: false };
let state: ThemeState = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "dark" || raw === "light" || raw === "system" ? raw : "system";
  } catch {
    return "system";
  }
}

function readStoredMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MOTION_KEY) === "reduced";
  } catch {
    return false;
  }
}

function osPrefersLight(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

function resolveMode(mode: ThemeMode): ThemeName {
  if (mode === "system") return osPrefersLight() ? "light" : "dark";
  return mode;
}

function persist(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    // Cookie mirror so the server can pick the right class on the next request.
    document.cookie = `${STORAGE_KEY}=${mode};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
  } catch {
    /* storage may be unavailable (private mode, quota); the class still applies */
  }
}

function apply(next: ThemeState): void {
  state = next;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(next.resolved);
  root.dataset.themeMode = next.mode;
  if (next.motionReduced) root.dataset.motion = "reduced";
  else delete root.dataset.motion;

  // Keep the mobile browser chrome in step with the surface.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", next.resolved === "dark" ? "#080b12" : "#f2f5f9");
  }

  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemeState {
  return state;
}

function getServerSnapshot(): ThemeState {
  return SERVER_SNAPSHOT;
}

/* ─── Hook ──────────────────────────────────────────────────────────── */

export interface ThemeControls {
  mode: ThemeMode;
  resolved: ThemeName;
  motionReduced: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  setMotionReduced: (value: boolean) => void;
}

/**
 * Subscribe to the theme store.
 *
 * Uses `useSyncExternalStore` rather than React state so every consumer sees
 * the same value in the same tick — two theme toggles mounted at once (header
 * and mobile menu) can never disagree.
 */
export function useFsTheme(): ThemeControls {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Hydrate from storage on mount, then keep `system` mode live.
  React.useEffect(() => {
    const mode = readStoredMode();
    apply({ mode, resolved: resolveMode(mode), motionReduced: readStoredMotion() });

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (state.mode === "system") {
        apply({ ...state, resolved: resolveMode("system") });
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setMode = React.useCallback((mode: ThemeMode) => {
    persist(mode);
    apply({ ...state, mode, resolved: resolveMode(mode) });
  }, []);

  const toggle = React.useCallback(() => {
    // Toggling from `system` pins the opposite of what the user currently
    // sees, which is what they expect from a toggle.
    const next: ThemeName = state.resolved === "dark" ? "light" : "dark";
    setMode(next);
  }, [setMode]);

  const setMotionReduced = React.useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(MOTION_KEY, value ? "reduced" : "full");
    } catch {
      /* ignore */
    }
    apply({ ...state, motionReduced: value });
  }, []);

  return {
    mode: snapshot.mode,
    resolved: snapshot.resolved,
    motionReduced: snapshot.motionReduced,
    setMode,
    toggle,
    setMotionReduced,
  };
}

/* ─── Controls ──────────────────────────────────────────────────────── */

/**
 * Icon button that flips light ↔ dark.
 * The label states the *target* theme, which is what the user is choosing.
 */
export function ThemeToggle({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const { resolved, toggle } = useFsTheme();
  const target = resolved === "dark" ? "light" : "dark";
  const [announced, setAnnounced] = React.useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          toggle();
          setAnnounced(`${target} theme applied`);
        }}
        aria-label={`Switch to ${target} theme`}
        title={`Switch to ${target} theme`}
        className={cn(
          "fs-press inline-flex items-center justify-center rounded-md border border-transparent text-ink-muted",
          "transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
          size === "sm" ? "size-8" : "size-9",
          className,
        )}
      >
        <Icon name={resolved === "dark" ? "sun" : "moon"} size={16} />
      </button>
      <span className="fs-sr-only" aria-live="polite">
        {announced}
      </span>
    </>
  );
}

/**
 * Three-way theme choice for menus/settings: Dark, Light, System.
 * A radio group, so the current mode is conveyed, not just the result.
 */
export function ThemeMenuItems({
  className,
  as = "radio",
}: {
  className?: string;
  /** `radio` for settings panels, `buttons` for dropdown rows. */
  as?: "radio" | "buttons";
}) {
  const { mode, setMode } = useFsTheme();
  const options: Array<{ value: ThemeMode; label: string }> = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
    { value: "system", label: "Match system" },
  ];

  if (as === "radio") {
    return (
      <fieldset className={cn("min-w-0", className)}>
        <legend className="fs-label mb-2">Appearance</legend>
        <div className="flex flex-col gap-1.5">
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="fs-theme-mode"
                value={o.value}
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
                className="peer size-4 appearance-none rounded-full border border-[var(--fs-border-strong)] bg-surface checked:border-[var(--fs-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]"
              />
              <span
                aria-hidden="true"
                className="-ml-[1.375rem] mr-0 size-2 rounded-full bg-[var(--fs-accent)] opacity-0 peer-checked:opacity-100"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setMode(o.value)}
          aria-pressed={mode === o.value}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
            "transition-colors duration-fast ease-out hover:bg-surface-2",
            mode === o.value ? "text-ink" : "text-ink-muted",
          )}
        >
          <span className="flex size-3 items-center justify-center">
            {mode === o.value ? <Icon name="check" size={11} /> : null}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Motion opt-out. Independent of the OS setting — a user may want the OS
 * animation for other apps but a static interface here.
 */
export function MotionToggle({ className }: { className?: string }) {
  const { motionReduced, setMotionReduced } = useFsTheme();
  const id = React.useId();

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={motionReduced}
          onChange={(e) => setMotionReduced(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full border border-[var(--fs-border-strong)] bg-surface-3",
            "transition-[background-color,border-color] duration-fast ease-out",
            "peer-checked:border-[var(--fs-accent)] peer-checked:bg-[var(--fs-accent)]",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--fs-focus-ring)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--fs-bg)]",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-0.5 size-4 rounded-full bg-ink",
            "transition-transform duration-fast ease-out peer-checked:translate-x-4 peer-checked:bg-[var(--fs-accent-contrast)]",
          )}
        />
      </span>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm leading-snug text-ink">
          Reduce motion
        </label>
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">
          Turns off decorative animation. Nothing in the product depends on it.
        </p>
      </div>
    </div>
  );
}