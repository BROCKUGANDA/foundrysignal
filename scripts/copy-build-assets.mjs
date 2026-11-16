// Copies build assets into the Next.js standalone output.
//
// The previous `build` script shelled out to `cp -r`, which is not portable:
// Windows shells (and bun's script runner there) reject it, so a successful
// `next build` still exited non-zero and broke the deploy pipeline. Node's
// fs.cpSync does the same copy everywhere.
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const standalone = resolve(root, ".next/standalone");

for (const target of [resolve(standalone, ".next"), standalone]) {
  mkdirSync(target, { recursive: true });
}

cpSync(resolve(root, ".next/static"), resolve(standalone, ".next/static"), { recursive: true });
cpSync(resolve(root, "public"), standalone, { recursive: true });

console.log(`[copy-build-assets] static + public -> ${standalone}`);
