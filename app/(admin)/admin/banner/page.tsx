"use client";

import { useRef, useState, useCallback } from "react";
import { toPng } from "html-to-image";

/**
 * X/Twitter Banner Generator — 1500x500px
 * Visit /banner to preview and download.
 */
export default function BannerPage() {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!bannerRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(bannerRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = "throws-gg-x-banner.png";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to generate banner:", err);
    }
    setDownloading(false);
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-6 p-8">
      <p className="text-white/40 text-sm">X/Twitter Banner — 1500x500 (preview scaled to fit)</p>

      {/* Scaled preview wrapper */}
      <div className="w-full max-w-[900px] overflow-hidden rounded-xl border border-white/10"
        style={{ aspectRatio: "1500 / 500" }}>
        <div style={{ transform: "scale(0.6)", transformOrigin: "top left", width: 1500, height: 500 }}>
          <Banner ref={bannerRef} />
        </div>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
      >
        {downloading ? "Generating..." : "Download PNG (2x)"}
      </button>

      {/* Hidden full-size version for capture */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <Banner ref={bannerRef} />
      </div>
    </div>
  );
}

import { forwardRef } from "react";

const Banner = forwardRef<HTMLDivElement>(function Banner(_, ref) {
  return (
    <div
      ref={ref}
      style={{
        width: 1500,
        height: 500,
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #07070C 0%, #0A0A12 25%, #0D0B18 50%, #0A0A12 75%, #07070C 100%)",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      {/* === Ambient glow orbs === */}
      {/* Violet glow — left */}
      <div style={{
        position: "absolute", top: -120, left: 80, width: 500, height: 500,
        background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.04) 40%, transparent 70%)",
      }} />
      {/* Magenta glow — center-right */}
      <div style={{
        position: "absolute", top: -80, right: 200, width: 450, height: 450,
        background: "radial-gradient(circle, rgba(236,72,153,0.10) 0%, rgba(236,72,153,0.03) 40%, transparent 70%)",
      }} />
      {/* Cyan glow — bottom right */}
      <div style={{
        position: "absolute", bottom: -100, right: -50, width: 400, height: 400,
        background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 60%)",
      }} />
      {/* Green subtle glow — mid-left */}
      <div style={{
        position: "absolute", bottom: -60, left: 300, width: 300, height: 300,
        background: "radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 60%)",
      }} />

      {/* === Horizontal accent line === */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, transparent 5%, #8B5CF6 25%, #EC4899 50%, #06B6D4 75%, transparent 95%)",
        opacity: 0.4,
      }} />

      {/* === Grid pattern overlay === */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* === Main content === */}
      <div style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "100%", padding: "0 100px",
      }}>

        {/* Left side — Logo + Tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 700 }}>
          {/* Logo mark */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-horse.png"
              alt="throws.gg"
              width={280}
              height={70}
              style={{ height: 56, width: "auto", filter: "brightness(1.1)" }}
            />
          </div>

          {/* Headline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{
              fontSize: 46, fontWeight: 900, lineHeight: 1.1, letterSpacing: "-1px",
              color: "#F8FAFC",
            }}>
              Virtual horse racing.
            </div>
            <div style={{
              fontSize: 46, fontWeight: 900, lineHeight: 1.1, letterSpacing: "-1px",
              background: "linear-gradient(90deg, #8B5CF6 0%, #EC4899 50%, #06B6D4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Real payouts.
            </div>
          </div>

          {/* Sub-tagline */}
          <div style={{
            fontSize: 15, color: "rgba(255,255,255,0.30)", letterSpacing: "0.02em",
            lineHeight: 1.5,
          }}>
            16 virtual horses &middot; Fixed odds &middot; Races every 3 min &middot; Provably fair &middot; Crypto-native
          </div>
        </div>

        {/* Right side — Race card preview */}
        <div style={{
          width: 340, borderRadius: 16,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "20px 24px",
          display: "flex", flexDirection: "column", gap: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}>
          {/* Card header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600 }}>
              Race #1,247
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: 10, color: "rgba(34,197,94,0.6)", fontWeight: 600 }}>LIVE</span>
            </div>
          </div>

          {/* Horse entries */}
          {[
            { gate: 1, name: "Moon Shot", odds: "3.16", color: "#FBBF24" },
            { gate: 2, name: "Thunder Edge", odds: "4.20", color: "#8B5CF6" },
            { gate: 3, name: "Rug Pull", odds: "6.50", color: "#EC4899" },
            { gate: 4, name: "Paper Hands", odds: "8.40", color: "#06B6D4" },
            { gate: 5, name: "Dead Cat", odds: "12.80", color: "#64748B" },
          ].map((h) => (
            <div key={h.gate} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 0",
              borderTop: h.gate > 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                backgroundColor: h.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800, color: "#fff",
                boxShadow: `0 0 12px ${h.color}30`,
              }}>
                {h.gate}
              </div>
              <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>
                {h.name}
              </span>
              <span style={{
                fontSize: 14, fontWeight: 900, fontFamily: "monospace",
                color: parseFloat(h.odds) < 5 ? "rgba(255,255,255,0.6)" : parseFloat(h.odds) < 10 ? "rgba(255,255,255,0.4)" : "rgba(34,197,94,0.6)",
              }}>
                {h.odds}
              </span>
            </div>
          ))}

          {/* Bottom row */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10,
          }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>1600m &middot; Good ground</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>8 runners</span>
          </div>
        </div>
      </div>

      {/* === Bottom accent line === */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, transparent 5%, #06B6D4 25%, #EC4899 50%, #8B5CF6 75%, transparent 95%)",
        opacity: 0.3,
      }} />
    </div>
  );
});
