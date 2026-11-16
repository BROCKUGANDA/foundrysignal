// Copies build assets into the Next.js standalone output.
//
// The previous `build` script shelled out to `cp -r`, which is not portable:
// Windows shells (and bun's script runner there) reject it, so a successful
// `next build` still exited non-zero and broke the deploy pipeline. Node's
// fs.cpSync does the same copy everywhere.
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function copyBuildAssets(root = process.cwd()) {
  const standalone = resolve(root, ".next/standalone");

  // cpSync with recursive:true merges the source directory's CONTENTS into an
  // existing destination. The destination must therefore end in `static`:
  // copying into `.next` drops chunks at `.next/chunks/*` while the built HTML
  // requests `/_next/static/chunks/*`, so every chunk 404s and the client
  // shell can never hydrate after a redeploy.
  mkdirSync(resolve(standalone, ".next/static"), { recursive: true });
  mkdirSync(standalone, { recursive: true });
  cpSync(resolve(root, ".next/static"), resolve(standalone, ".next/static"), {
    recursive: true,
  });
  cpSync(resolve(root, "public"), standalone, { recursive: true });

  return standalone;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`[copy-build-assets] static + public -> ${copyBuildAssets()}`);
}
