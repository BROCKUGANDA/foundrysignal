"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/fs/brand/glyphs";

/**
 * Modal shell — Dialog (centered) and Drawer (edge-anchored).
 *
 * Built on Radix Dialog primitives because the accessibility contract there is
 * hard to get right by hand: focus trap, focus restoration on close, Escape,
 * scroll lock, aria-modal, and `pointer-events` outside the surface. Rebuilding
 * it would be a regression risk for no design benefit.
 *
 * What this layer adds:
 *  - Theme-aware scrim (no hard-coded rgba)
 *  - Consistent enter/exit motion (gated by reduced-motion)
 *  - Standard header: title, description, close button with a real label
 *  - `size` scale so dialogs across the app share one rhythm
 *
 * State contract (Radix supplies the mechanics):
 *   closed    unmounted, trigger retains focus
 *   open      scrim + surface animate in, focus moves to first focusable or
 *             the surface itself
 *   loading   pass `busy` to set aria-busy and block dismissal
 *   error     render ErrorState inside the body
 */

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  full: "max-w-[calc(100vw-2rem)]",
} as const;

type DialogSize = keyof typeof SIZE;

/* ─── Internal Radix imports (kept local so the public API stays small) ── */

import * as DialogPrimitive from "@radix-ui/react-dialog";

const Scrim = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function Scrim({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-[var(--fs-scrim)] backdrop-blur-[2px]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        "duration-base ease-out",
        className,
      )}
      {...props}
    />
  );
});

/* ─── Public API ────────────────────────────────────────────────────── */

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/** Root — owns open state. */
export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export interface DialogContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "title"> {
  size?: DialogSize;
  /** Prevent Escape / scrim dismissal while a mutation is in flight. */
  busy?: boolean;
  /** Accessible name; required by ARIA for modal dialogs. */
  title: string;
  description?: string;
  /** Hide the built-in close button (custom footers still get Escape). */
  hideClose?: boolean;
  children: React.ReactNode;
}

export function DialogContent({
  size = "md",
  busy,
  title,
  description,
  hideClose,
  className,
  children,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Scrim />
      <DialogPrimitive.Content
        aria-busy={busy || undefined}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
          onInteractOutside?.(event);
        }}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
          "fs-panel-raised flex max-h-[calc(100dvh-4rem)] flex-col overflow-hidden",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "duration-slow ease-out",
          SIZE[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--fs-border)] px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="fs-brand text-base font-semibold leading-tight text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-xs leading-relaxed text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              // Radix warns when Description is missing; an empty description
              // keeps the relationship without inventing copy.
              <DialogPrimitive.Description className="fs-sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {hideClose ? null : (
            <DialogPrimitive.Close
              className={cn(
                "fs-press -mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted",
                "transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-ink",
              )}
              aria-label="Close dialog"
            >
              <Icon name="close" size={16} />
            </DialogPrimitive.Close>
          )}
        </div>
        <div className="fs-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Sticky footer slot for actions. */
export function DialogFooter({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-[var(--fs-border)] bg-surface-2 px-5 py-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ─── Drawer ────────────────────────────────────────────────────────── */

type DrawerSide = "right" | "left" | "bottom";

const DRAWER_POSITION: Record<DrawerSide, string> = {
  right:
    "inset-y-0 right-0 h-full w-[min(28rem,100vw)] border-l " +
    "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  left:
    "inset-y-0 left-0 h-full w-[min(28rem,100vw)] border-r " +
    "data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t " +
    "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
};

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Drawer({ open, onOpenChange, children }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export interface DrawerContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "title" | "side"> {
  side?: DrawerSide;
  busy?: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function DrawerContent({
  side = "right",
  busy,
  title,
  description,
  className,
  children,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: DrawerContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Scrim />
      <DialogPrimitive.Content
        aria-busy={busy || undefined}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
          onInteractOutside?.(event);
        }}
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-e3",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "duration-slower ease-out",
          DRAWER_POSITION[side],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--fs-border)] px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="fs-brand text-base font-semibold leading-tight text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-xs leading-relaxed text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="fs-sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className={cn(
              "fs-press -mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted",
              "transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-ink",
            )}
            aria-label="Close panel"
          >
            <Icon name="close" size={16} />
          </DialogPrimitive.Close>
        </div>
        <div className="fs-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ─── Tooltip ───────────────────────────────────────────────────────── */

import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/** Provider — mount once at the app root. */
export function TooltipProvider({
  children,
  delayDuration = 300,
  skipDelayDuration = 200,
}: {
  children: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  /** The tooltip text. Keep it short; this is a label, not a paragraph. */
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Set false when the content is identical to the accessible name. */
  withArrow?: boolean;
}

export function Tooltip({ content, children, side = "top", withArrow = true }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-64 rounded-md border border-[var(--fs-border-strong)] bg-surface-2 px-2.5 py-1.5",
            "text-2xs leading-snug text-ink shadow-e2",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "duration-fast ease-out",
          )}
        >
          {content}
          {withArrow ? <TooltipPrimitive.Arrow className="fill-[var(--fs-surface-2)]" /> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}