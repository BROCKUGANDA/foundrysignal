import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

describe("pre-paint theme hydration", () => {
  test("head script is a server-owned literal, not a client module reference", () => {
    expect(layout).not.toMatch(/import\s+\{\s*THEME_BOOTSTRAP\s*\}/);
    expect(layout).toMatch(/const THEME_BOOTSTRAP = `/);
    expect(layout).toContain("nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}");
  });

  test("bootstrap preserves stored themes, system preference and reduced motion", () => {
    const script = layout.match(/const THEME_BOOTSTRAP = `([\s\S]*?)`;/)?.[1];
    expect(script).toBeDefined();
    for (const mode of ["dark", "light", "system", null]) {
      for (const prefersLight of [false, true]) {
        const classes = new Set(["font-variable", "dark"]);
        const dataset: Record<string, string> = {};
        runInNewContext(script!, {
          document: { documentElement: { dataset, classList: {
            remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
            add: (name: string) => classes.add(name),
          } } },
          localStorage: { getItem: (key: string) => key === "fs-theme" ? mode : "reduced" },
          window: { matchMedia: () => ({ matches: prefersLight }) },
        });
        const resolved = mode === "dark" || mode === "light" ? mode : prefersLight ? "light" : "dark";
        expect([...classes].sort()).toEqual(["font-variable", resolved].sort());
        expect(dataset).toEqual({ themeMode: mode ?? "system", motion: "reduced" });
      }
    }
    expect(() => runInNewContext(script!, {
      document: { documentElement: {} },
      localStorage: { getItem: () => { throw new Error("Storage unavailable"); } },
    })).not.toThrow();
  });
});