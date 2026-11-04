"use client";

import { useEffect } from "react";

// WHY: this file replaces the whole document, so it cannot rely on globals.css or the app font;
// every style is inline and the colours mirror the light theme tokens in globals.css.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // `digest` is set by Next at runtime but is not on the standard Error type; narrow before reading it.
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;

  return (
    <html lang="th">
      <body style={{ margin: 0, backgroundColor: "#f4f5f2", color: "#142029", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
          <div style={{ width: "100%", maxWidth: 448, backgroundColor: "#ffffff", border: "1px solid #e1e4df", borderRadius: 8, padding: 24 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>เกิดข้อผิดพลาดในหน้านี้</h1>
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, lineHeight: 1.6, color: "#55606a" }}>
              ระบบทำงานผิดปกติชั่วคราว ลองกด &ldquo;ลองอีกครั้ง&rdquo; ถ้ายังไม่หาย ให้กลับไปหน้าแรกแล้วเข้าใหม่
            </p>
            <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                type="button"
                onClick={retry}
                style={{
                  cursor: "pointer",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 700,
                  backgroundColor: "#142029",
                  color: "#ffffff",
                }}
              >
                ลองอีกครั้ง
              </button>
              {/* WHY: global-error replaces the root layout, so there is no router context for <Link>; a full page load is what we want here. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  border: "1px solid #c9cec6",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 700,
                  backgroundColor: "#ffffff",
                  color: "#142029",
                  textDecoration: "none",
                }}
              >
                กลับหน้าแรก
              </a>
            </div>
            {digest && <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: "#55606a" }}>รหัสอ้างอิง: {digest}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}
