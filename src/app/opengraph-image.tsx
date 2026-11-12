import { ImageResponse } from "next/og";

export const alt = "AstaDesk: AI customer support for Shopify stores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#1E806B";
const CREAM = "#F5F5F0";

/** The 1200×630 share card (og:image and twitter:image) for every page. */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #F7F6F1 0%, #E3F0EB 100%)",
          color: "#12211D",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="84" height="84" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" fill={GREEN} />
            <path d="M22 54a28 28 0 0 1 56 0" fill="none" stroke={CREAM} strokeWidth="4" strokeLinecap="round" />
            <rect x="17" y="49" width="10" height="17" rx="5" fill={CREAM} />
            <rect x="73" y="49" width="10" height="17" rx="5" fill={CREAM} />
            <rect x="29" y="33" width="42" height="36" rx="13" fill={CREAM} />
            <rect x="37" y="44" width="7" height="11" rx="3.5" fill={GREEN} />
            <rect x="56" y="44" width="7" height="11" rx="3.5" fill={GREEN} />
            <path d="M42 60q8 5.5 16 0" fill="none" stroke={GREEN} strokeWidth="3.2" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 48, fontWeight: 700 }}>AstaDesk</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
            AI customer support for Shopify stores
          </div>
          <div style={{ fontSize: 34, lineHeight: 1.35, color: "#3F534D" }}>
            Ava answers order, shipping and product questions from live Shopify data. Refunds always wait for your approval.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: GREEN, fontWeight: 600 }}>www.astadesk.com</div>
      </div>
    ),
    size,
  );
}
