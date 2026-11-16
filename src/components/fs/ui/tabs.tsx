"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tabs — accessible, URL-optional, keyboard-navigable.
 *
 * Implemented on WAI-ARIA's manual-activation pattern with real buttons and
 * `aria-selected`, so arrow keys move focus and Enter/Space activates. Manual
 * activation is deliberate: FoundrySignal's tabs load panels lazily, and
 * auto-activating on arrow press would fire a fetch for every tab the user
 * merely scrolls past with the keyboard.
 *
 * State contract:
 *   default    muted label
 *   hover      ink label
 *   focus      accent ring (via :focus-visible)
 *   selected   accent underline + ink label, aria-selected="true"
 *   disabled   muted, aria-disabled, skipped by arrow navigation
 *
 * The underline is a pseudo-element, so selection never shifts label position.
 */

export interface TabItem {
  value: string;
  label: React.ReactNode;
  /** Count badge rendered after the label (e.g. open alerts). */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: ReadonlyArray<TabItem>;
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible label for the tab list. */
  ariaLabel: string;
  className?: string;
  /** Stretch each tab to share the row width. */
  block?: boolean;
  /** Compact height for dense toolbars. */
  size?: "sm" | "md";
}

export function Tabs({ items, value, onValueChange, ariaLabel, className, block, size = "md" }: TabsProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const id = React.useId();

  const focusIndex = (from: number, delta: number) => {
    const enabled = items.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(from);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-[var(--fs-border)]",
        "fs-scroll",
        block && "w-full",
        className,
      )}
    >
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[i] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${id}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                focusIndex(i, 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                focusIndex(i, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                const first = items.findIndex((t) => !t.disabled);
                if (first >= 0) refs.current[first]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                const last = items.reduce((acc, t, idx) => (t.disabled ? acc : idx), -1);
                if (last >= 0) refs.current[last]?.focus();
              }
            }}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "fs-press relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3",
              "text-sm font-medium transition-colors duration-fast ease-out",
              size === "sm" ? "h-8" : "h-9",
              block && "flex-1 justify-center",
              selected ? "text-ink" : "text-ink-muted hover:text-ink",
              "disabled:pointer-events-none disabled:opacity-50",
              // focus ring inset so it is not clipped by overflow-x
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fs-focus-ring)]",
            )}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" && item.count > 0 ? (
              <span className="fs-data rounded-full bg-[var(--fs-accent)] px-1.5 text-2xs font-semibold text-[var(--fs-accent-contrast)]">
                {item.count}
              </span>
            ) : null}
            {/* Selection underline — absolute, so it never affects layout. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity duration-fast ease-out",
                selected ? "bg-[var(--fs-accent)] opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tab panel. Wired to its trigger by `value`; callers render one panel per tab
 * and pass `active` to mount only the current one.
 *
 * Panels are unmounted when inactive by design: each FoundrySignal tab owns a
 * query, and keeping all nine mounted would fire nine requests per dossier.
 */
export function TabPanel({
  value,
  activeValue,
  id,
  children,
  className,
  /** Force-mount even when inactive (preserves local UI state). */
  keepMounted,
}: {
  value: string;
  activeValue: string;
  /** Base id from the owning Tabs instance (matches `${id}-panel-${value}`). */
  id: string;
  children: React.ReactNode;
  className?: string;
  keepMounted?: boolean;
}) {
  const selected = value === activeValue;
  if (!selected && !keepMounted) return null;

  return (
    <div
      role="tabpanel"
      id={`${id}-panel-${value}`}
      aria-labelledby={`${id}-tab-${value}`}
      tabIndex={0}
      hidden={!selected}
      className={cn("focus-visible:outline-none", className)}
    >
      {children}
    </div>
  );
}

/**
 * Stateful tab container: owns the active value and wires panels by id.
 *
 * Use this when the active tab should not live in a router. Panels receive
 * `isActive` so they can lazy-load on first activation.
 */
export function TabbedPanels<T extends string>({
  items,
  panels,
  ariaLabel,
  className,
  defaultActive,
  size,
  block,
}: {
  items: ReadonlyArray<TabItem>;
  panels: Record<T, (isActive: boolean) => React.ReactNode>;
  ariaLabel: string;
  className?: string;
  defaultActive?: T;
  size?: "sm" | "md";
  block?: boolean;
}) {
  const [active, setActive] = React.useState<T>(
    () => defaultActive ?? (items.find((i) => !i.disabled)?.value as T) ?? ("" as T),
  );
  const id = React.useId();

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Tabs
        items={items}
        value={active}
        onValueChange={(v) => setActive(v as T)}
        ariaLabel={ariaLabel}
        size={size}
        block={block}
      />
      {(Object.keys(panels) as T[]).map((key) => {
        const selected = key === active;
        if (!selected) return null;
        return (
          <div
            key={key}
            role="tabpanel"
            id={`${id}-panel-${key}`}
            aria-labelledby={`${id}-tab-${key}`}
            tabIndex={0}
            className="fs-fade-in focus-visible:outline-none"
          >
            {panels[key](selected)}
          </div>
        );
      })}
    </div>
  );
}