import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "./globals.css";
import { Providers } from "@/components/fs/providers";
import { THEME_BOOTSTRAP } from "@/components/fs/theme";
import { SITE, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "FoundrySignal — See the builders. Verify the work. Understand the market.",
    template: "%s · FoundrySignal",
  },
  description: SITE.description,
  keywords: [
    "venture intelligence",
    "Solana",
    "evidence graph",
    "founder research",
    "onchain analytics",
    "GitHub diligence",
    "Dubai",
    "UAE",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "FoundrySignal",
    description: "The intelligence layer for onchain venture capital.",
    siteName: SITE.name,
    type: "website",
    locale: SITE.locale,
    alternateLocale: [...SITE.localeAlternates],
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "FoundrySignal",
    description: "See the builders. Verify the work. Understand the market.",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    // Safari pinned-tab monochrome mark.
    other: [{ rel: "mask-icon", url: "/brand/emblem-mono.svg", color: "#64e5cb" }],
  },
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false, address: false, email: false },
  other: {
    "geo.region": SITE.geo.region,
    "geo.placename": SITE.geo.placename,
    "geo.position": SITE.geo.position,
    ICBM: SITE.geo.icbm,
    "dubai-uae-market": "primary",
  },
};

export const viewport: Viewport = {
  themeColor: [
    // Browser chrome follows the active theme; the bootstrap script rewrites
    // this on first paint, these are the no-JS defaults.
    { media: "(prefers-color-scheme: dark)", color: "#080B12" },
    { media: "(prefers-color-scheme: light)", color: "#f2f5f9" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark` is the no-JS default; THEME_BOOTSTRAP replaces it before paint.
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        {/* Pre-paint theme application: prevents a light/dark flash. Space
            Grotesk ships via @fontsource above (self-hosted woff2, swap), so
            no manual preload is needed and none can point at a stale path. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="fs-grain min-h-dvh antialiased">
        <a href="#fs-main" className="fs-skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}