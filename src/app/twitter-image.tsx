// Twitter/X cards use the same brand-rendered artwork as Open Graph.
// Re-exporting the generator keeps one source of truth while letting Next.js
// emit twitter:image with the correct dimensions and content type.
export { alt, contentType, default, size } from "./opengraph-image";
