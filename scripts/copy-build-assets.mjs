// Copies build assets into the Next.js standalone output.
//
// The previous `build` script shelled out to `cp -r`, which is not portable:
// Windows shells (and bun's script runner there) reject it, so a successful
// `next build` still exited non-zero and broke the deploy pipeline. Node's
// fs.cpSync does the same copy everywhere.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const standalone = resolve(root, ".next/standalone");

// cpSync copies a directory's *contents* into the destination, so the
// destination must be the directory Next actually serves from. Passing
// `.next` here instead of `.next/static` scattered chunks/ and media/ one
// level too high: every /_next/static/... URL 404'd and pages rendered
// without CSS or JS.
const copies = [
  [resolve(root, ".next/static"), resolve(standalone, ".next/static")],
  [resolve(root, "public"), resolve(standalone, "public")],
];

for (const [, target] of copies) mkdirSync(target, { recursive: true });
for (const [from, to] of copies) cpSync(from, to, { recursive: true });

// A standalone bundle without these is a page with no stylesheet — fail the
// build rather than shipping it.
for (const required of [
  resolve(standalone, ".next/static/chunks"),
  resolve(standalone, "public"),
]) {
  if (!existsSync(required)) {
    console.error(`[copy-build-assets] missing after copy: ${required}`);
    process.exit(1);
  }
}

console.log(`[copy-build-assets] static + public -> ${standalone}`);
