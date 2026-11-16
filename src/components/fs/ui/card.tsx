import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — the base surface for all content grouping.
 *
 * Variants differ only in elevation and emphasis, never in padding, so cards
 * remain visually swappable in a grid.
 *
 *   default  flat surface, hairline border         — dense lists, table rows
 *   raised   +elevation-2                          — primary content
 *   inset    sunken surface                        — nested metadata blocks
 *   dashed   dashed strong border                  — "drop content here"
 *   accent   accent hairline + accent-subtle wash  — the single focus of a view
 *
 * Interactive cards (`onSelect`, `asChild`) promote to a group with hover
 * elevation and a real focus ring; the hit target is the whole card.
 */

type CardVariant = "default" | "raised" | "inset" | "dashed" | "accent";

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: "fs-panel",
  raised: "fs-panel-raised",
  inset: "fs-panel-inset",
  dashed: "fs-panel-dashed",
  accent: "fs-panel border-[var(--fs-accent-border)] bg-[var(--fs-accent-subtle)]",
};

export interface CardProps extends React.ComponentPropsWithoutRef<"div"> {
  variant?: CardVariant;
  /** Whole-card click target. Adds hover elevation + role/keys. */
  onSelect?: () => void;
  /** Render as the child element. */
  asChild?: boolean;
  /** Sticky header rule; used by list/table cards. */
  divided?: boolean;
}


export function Card({ variant = "default", className, onSelect, asChild, divided, children, ...props }: CardProps) {
  if (asChild) {
    return (
      <div data-slot="card" data-variant={variant} className={className}>
        {children}
      </div>
    );
  }

  const interactive = Boolean(onSelect);

  return (
    <div
      data-slot="card"
      data-variant={variant}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
      className={cn(
        VARIANT_CLASS[variant],
        "relative rounded-lg",
        divided && "divide-y divide-[var(--fs-border)]",
        interactive &&
          "fs-press cursor-pointer text-left transition-[box-shadow,border-color,transform] duration-fast ease-out hover:border-[var(--fs-border-strong)] hover:shadow-e2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex items-start justify-between gap-3 px-4 pt-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("fs-brand text-lg font-semibold leading-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm leading-snug text-ink-muted", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div data-slot="card-content" className={cn("px-4 pb-4 pt-3", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center justify-between gap-3 border-t border-[var(--fs-border)] px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export type { CardVariant };