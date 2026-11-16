"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — the reference implementation of the FoundrySignal state contract.
 *
 * State matrix (all reachable from props, none dependent on JS):
 *   default   → resting
 *   hover     → --fs-accent-hover / surface shift + elevation
 *   focus     → 2px outline + halo, :focus-visible only (never on click)
 *   active    → 0.975 scale press (transform only, no layout shift)
 *   disabled  → real `disabled`, pointer-events none, muted fg, 50% bg
 *   loading   → `loading` prop: spinner replaces leading icon, aria-busy,
 *               click suppressed, label still announced
 *
 * @accessibility
 * - `loading` sets `aria-busy` and blocks activation, so assistive tech and
 *   keyboard users cannot double-submit.
 * - Icon-only buttons require an `aria-label`; the `icon` size does not add
 *   one automatically because the label is caller knowledge.
 * - `asChild` forwards to Radix Slot so `<Link>` keeps its own semantics.
 */

const spinner = (
  <span
    aria-hidden="true"
    className="fs-spin inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent"
  />
);

const buttonVariants = cva(
  [
    "fs-btn fs-press group/btn relative inline-flex select-none items-center justify-center gap-2",
    "whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform]",
    "duration-fast ease-out",
    "disabled:pointer-events-none disabled:opacity-55",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    // Invalid state — destructive-tinted ring, never a silent fail.
    "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/30",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Filled accent. One per view. */
        primary:
          "bg-accent text-[var(--fs-accent-contrast)] border border-transparent hover:bg-accent-hover active:bg-accent-active shadow-e1 hover:shadow-e2",
        /** Neutral fill for secondary actions. */
        secondary:
          "bg-surface-3 text-ink border border-transparent hover:bg-surface-4 hover:border-hairline-strong",
        /** Bordered; the default for toolbars and destructive-adjacent actions. */
        outline:
          "bg-surface text-ink border border-hairline-strong hover:bg-surface-2 hover:border-[var(--fs-border-emphasis)]",
        /** No chrome; for dense toolbars and table rows. */
        ghost: "bg-transparent text-ink-muted border border-transparent hover:bg-surface-2 hover:text-ink",
        /** Inline text action; underline on hover. */
        link: "bg-transparent text-[var(--fs-accent-fg)] border border-transparent hover:underline underline-offset-4 px-0",
        /** Irreversible action. Always paired with a confirm step upstream. */
        destructive:
          "bg-[var(--fs-danger)] text-[var(--fs-obsidian-950)] border border-transparent hover:brightness-110 active:brightness-95 shadow-e1",
      },
      size: {
        sm: "h-8 px-3 text-sm gap-1.5 rounded-sm",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5 text-md",
        /** Square; caller MUST supply aria-label. */
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-8 w-8 p-0 rounded-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends Omit<React.ComponentPropsWithoutRef<"button">, "disabled">,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. a Next.js `<Link>`). */
  asChild?: boolean;
  /** Blocks activation and swaps the leading icon for a spinner. */
  loading?: boolean;
  /** Label shown while loading; omit for icon-only affordances. */
  loadingLabel?: string;
  /** Blocks activation. Prefer `disabledReason` so the block is explainable. */
  disabled?: boolean;
  /** Explains why the button is blocked; surfaces as `title`. */
  disabledReason?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    loadingLabel,
    disabled,
    disabledReason,
    children,
    onClick,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  const isBlocked = disabled || loading;

  if (asChild) {
    return (
      <Comp
        ref={ref}
        data-slot="button"
        data-loading={loading ? "" : undefined}
        aria-busy={loading || undefined}
        aria-disabled={isBlocked || undefined}
        title={disabledReason}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      ref={ref}
      type={type ?? "button"}
      data-slot="button"
      data-loading={loading ? "" : undefined}
      disabled={isBlocked}
      aria-busy={loading || undefined}
      title={disabledReason}
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        if (isBlocked) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      {loading ? spinner : null}
      {loading && loadingLabel ? (
        <span>{loadingLabel}</span>
      ) : loading ? (
        <span className="fs-sr-only">Loading</span>
      ) : (
        children
      )}
    </Comp>
  );
});

export { buttonVariants };