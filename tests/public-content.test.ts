// Public-facing content must actually be exposed to crawlers and answer engines.
// Regression: generateMetadata classified marketing pages by raw URL segment
// instead of the resolved section, so "/", "/evidence" and "/api-docs" were
// emitted with noindex,nofollow despite being server-rendered public pages.
import { describe, test, expect } from "bun:test";
import { PUBLIC_ROUTES, pathToSection } from "@/lib/client/routes";
import { generateMetadata } from "../src/app/[[...fs]]/page";

describe("public marketing pages are indexable", () => {
  for (const { path } of PUBLIC_ROUTES) {
    test(`${path} resolves to a section and emits indexable metadata`, async () => {
      const match = pathToSection(path, "");
      expect(match).not.toBeNull();

      const metadata = await generateMetadata({
        params: Promise.resolve({ fs: path.split("/").filter(Boolean) }),
      });

      expect(metadata.robots).toEqual({ index: true, follow: true });
      expect(metadata.title).toBeTruthy();
      expect(metadata.alternates?.canonical).toBeTruthy();
    });
  }
});
