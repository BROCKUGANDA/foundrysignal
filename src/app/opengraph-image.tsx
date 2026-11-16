import { ImageResponse } from "next/og";

// Dynamic Open Graph image — brand-rendered for every route that does not
// override it. 1200×630, generated at request time (cached by the CDN).
export const alt = "FoundrySignal — See the builders. Verify the work. Understand the market.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#080B12",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#64E5CB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#06201A",
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            FS
          </div>
          <div style={{ color: "#EAF0F5", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>FoundrySignal</div>
          <div style={{ color: "#8A99AB", fontSize: 22, marginLeft: 24 }}>Dubai · UAE</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ color: "#EAF0F5", fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
            See the builders.
          </div>
          <div style={{ color: "#64E5CB", fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
            Verify the work.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#8A99AB", fontSize: 26 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: "1px solid rgba(120,153,255,0.3)",
              borderRadius: 999,
              padding: "10px 24px",
              color: "#64E5CB",
              fontSize: 22,
            }}
          >
            EVIDENCE-GRADED RESEARCH
          </div>
          <span>Solana venture intelligence — research first, not speculation.</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
