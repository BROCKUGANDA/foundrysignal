import type { MetadataRoute } from "next";

// PWA manifest — installable research terminal on mobile.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FoundrySignal — onchain venture intelligence",
    short_name: "FoundrySignal",
    description:
      "Discover early-stage Solana ventures, investigate founders, trace shipped software and read every claim against its original evidence.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#080B12",
    theme_color: "#080B12",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/brand/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon-512-maskable.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
