"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

/**
 * Toast — transient notification.
 *
 * Reuses the app's existing `sonner` Toaster (mounted in providers.tsx) so
 * there is exactly one toast system. This module provides the typed API and
 * the FoundrySignal visual treatment rather than a second renderer.
 *
 * Contract:
 *   success   confirmation of a completed mutation
 *   error     failure; includes the API error code when available
 *   warning   succeeded with a caveat (stale data, degraded provider)
 *   info      neutral progress
 *   loading   in-flight; `promise` form updates the same toast on settle
 *
 * Auto-dismiss is 5s for success/info, 8s for errors, and never for
 * loading-until-settled. Toasts are announced via aria-live by sonner.
 */

import { toast as sonnerToast } from "sonner";

export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  description?: string;
  /** API error code, shown verbatim so support can trace it. */
  code?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

const DURATION: Record<ToastTone, number> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  error: 8000,
};

const ICON: Record<ToastTone, string> = {
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
};

function emit(tone: ToastTone, title: string, options: ToastOptions = {}) {
  const { description, code, duration, action } = options;
  const detail = [description, code ? `(${code})` : null].filter(Boolean).join(" ");

  sonnerToast[tone](title, {
    description: detail || undefined,
    duration: duration ?? DURATION[tone],
    action: action
      ? {
          label: action.label,
          onClick: action.onClick,
        }
      : undefined,
  });
}

export const toast = {
  success: (title: string, options?: ToastOptions) => emit("success", title, options),
  error: (title: string, options?: ToastOptions) => emit("error", title, options),
  warning: (title: string, options?: ToastOptions) => emit("warning", title, options),
  info: (title: string, options?: ToastOptions) => emit("info", title, options),

  /** Dismiss every active toast. */
  dismiss: () => sonnerToast.dismiss(),

  /**
   * In-flight toast that resolves into success or error.
   * Pass the mutation promise; the toast owns its own lifecycle.
   */
  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((value: T) => string);
      error: string | ((error: unknown) => string);
    },
  ) =>
    sonnerToast.promise(promise, {
      loading: messages.loading,
      success: (value) =>
        typeof messages.success === "function" ? messages.success(value) : messages.success,
      error: (error) =>
        typeof messages.error === "function" ? messages.error(error) : messages.error,
    }),

  /** Reports an API client error with its code attached. */
  apiError: (title: string, error: unknown) => {
    const code = (error as { code?: string } | null)?.code;
    emit("error", title, { code });
  },
};

/**
 * The visual Toaster. Mounted by providers.tsx.
 *
 * Options are FoundrySignal-tuned: bottom-right keeps it clear of the mobile
 * bottom tab bar, and `offset` accounts for the safe area.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      offset={16}
      toastOptions={{
        classNames: {
          toast: "fs-panel-raised !rounded-lg !border-[var(--fs-border-strong)] !bg-surface !text-ink",
          description: "!text-ink-muted",
          actionButton: "!bg-accent !text-[var(--fs-accent-contrast)]",
          cancelButton: "!bg-surface-3 !text-ink",
          error: "!border-[var(--fs-danger-border)]",
          success: "!border-[var(--fs-success-border)]",
          warning: "!border-[var(--fs-warning-border)]",
        },
      }}
    />
  );
}

/** Inline tone glyph for use inside toasts and banners. */
export function ToastGlyph({ tone, className }: { tone: ToastTone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("fs-data inline-flex size-4 items-center justify-center text-2xs font-bold", className)}
    >
      {ICON[tone]}
    </span>
  );
}