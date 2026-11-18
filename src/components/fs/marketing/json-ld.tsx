// Server-only JSON-LD injection. This lives apart from content.tsx because
// content.tsx is also imported by client islands (marketing/nav.tsx), and
// client bundles cannot import next/headers.

import { headers } from "next/headers";

/** Injects structured data (JSON-LD). Server-rendered; crawler-first. */
export async function JsonLd({ data }: { data: object | object[] }) {
  // Per-request CSP nonce from src/middleware.ts. ld+json is not an
  // executable script type, but CSP governs <script> elements, so carry the
  // nonce; Next.js applies the same nonce to its own framework scripts.
  const nonce = (await headers()).get("x-middleware-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // `<` escaped so a string in the payload cannot close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
