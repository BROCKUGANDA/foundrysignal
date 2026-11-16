// Regression for the deploy failure: built HTML requests /_next/static/chunks/*,
// so the standalone artifact must place chunks at .next/static/chunks/*, not
// .next/chunks/*. An earlier copy destination broke every JS chunk after deploy.
import { describe, test, expect } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyBuildAssets } from "../scripts/copy-build-assets.mjs";

describe("standalone build assets", () => {
  test("chunks land under .next/static and public assets at the root", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-build-assets-"));
    try {
      mkdirSync(join(root, ".next", "static", "chunks"), { recursive: true });
      mkdirSync(join(root, "public", "brand"), { recursive: true });
      writeFileSync(join(root, ".next", "static", "chunks", "abc.js"), "// chunk");
      writeFileSync(join(root, "public", "favicon.svg"), "<svg/>");

      const standalone = copyBuildAssets(root);

      expect(existsSync(join(standalone, ".next", "static", "chunks", "abc.js"))).toBe(true);
      expect(existsSync(join(standalone, "favicon.svg"))).toBe(true);
      expect(existsSync(join(standalone, ".next", "chunks", "abc.js"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
