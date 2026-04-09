"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { toPng } from "html-to-image";
import type { Horse } from "@/lib/racing/constants";
import { useHorseSpriteUrl } from "./useHorseSpriteUrl";

interface RaceWinCardProps {
  horse: Horse;
  betAmount: number;
  lockedOdds: number;
  payout: number;
  raceNumber: number;
  distance: number;
  ground: string;
  gatePosition: number;
  username: string;
  onClose: () => void;
}

export function RaceWinCard({
  horse,
  betAmount,
  lockedOdds,
  payout,
  raceNumber,
  distance,
  ground,
  gatePosition,
  username,
  onClose,
}: RaceWinCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const maxWidth = window.innerWidth - 32;
      setScale(Math.min(1, maxWidth / 600));
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const winAmount = payout - betAmount;
  const winRate = horse.careerRaces > 0 ? ((horse.careerWins / horse.careerRaces) * 100).toFixed(0) : "—";
  const horseSpriteUrl = useHorseSpriteUrl(horse.slug, 64);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `throws-gg-race-${raceNumber}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to generate card:", err);
    }
    setDownloading(false);
  }, [raceNumber]);

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `throws-gg-race-${raceNumber}.png`, { type: "image/png" });

      const text = `+$${winAmount.toFixed(2)} on @throwsgg 🏇\n${horse.name} at ${lockedOdds.toFixed(2)}x\nRace #${raceNumber} — provably fair\n\nthrows.gg`;

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text, files: [file] });
        setDownloading(false);
        return;
      }

      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard failed — just open Twitter
      }

      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(twitterUrl, "_blank", "noopener,noreferrer,width=550,height=420");
    } catch (err) {
      console.error("Share failed:", err);
    }
    setDownloading(false);
  }, [winAmount, horse.name, lockedOdds, raceNumber]);

  // Stat bar helper — inline for html-to-image compatibility
  const statBar = (label: string, value: number, color: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", width: 14, textAlign: "right", fontFamily: "monospace" }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ height: "100%", borderRadius: 3, width: `${value}%`, background: color }} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", width: 18, textAlign: "right", fontFamily: "monospace" }}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex flex-col items-center gap-4 max-w-md w-full">
        <div style={{ width: 600 * scale, height: 340 * scale }}>
          {/* === CARD — captured as image === */}
          <div
            ref={cardRef}
            style={{
              width: 600,
              height: 340,
              background: "linear-gradient(135deg, #0A0A0F 0%, #12121A 50%, #0A0A0F 100%)",
              position: "relative",
              overflow: "hidden",
              borderRadius: 16,
              fontFamily: "Inter, system-ui, sans-serif",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {/* Glow — horse color top-left, violet bottom-right */}
            <div style={{
              position: "absolute", top: -80, left: -80, width: 240, height: 240,
              background: `radial-gradient(circle, ${horse.color}25 0%, transparent 70%)`,
            }} />
            <div style={{
              position: "absolute", bottom: -80, right: -80, width: 240, height: 240,
              background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)",
            }} />

            {/* Top bar */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <img
                src="/logo-horse.png"
                alt="throws.gg"
                style={{ height: 24, width: "auto" }}
                crossOrigin="anonymous"
              />
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "monospace" }}>
                RACE #{raceNumber.toLocaleString()}
              </div>
            </div>

            {/* Main content */}
            <div style={{
              display: "flex", gap: 24, padding: "20px 24px", height: 230,
            }}>
              {/* Left — win amount + bet info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <div style={{
                  fontSize: 44, fontWeight: 900, color: "#F59E0B", lineHeight: 1,
                  textShadow: "0 0 30px rgba(245,158,11,0.4)",
                }}>
                  +${winAmount.toFixed(2)}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{
                    background: "rgba(6,182,212,0.15)", color: "#06B6D4",
                    padding: "2px 10px", borderRadius: 6, fontSize: 14, fontWeight: 800,
                    fontFamily: "monospace",
                  }}>
                    {lockedOdds.toFixed(2)}x
                  </span>
                  <span style={{
                    background: "rgba(34,197,94,0.12)", color: "#22C55E",
                    padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800,
                    letterSpacing: "0.05em",
                  }}>
                    WIN
                  </span>
                </div>

                {/* Horse name + race info */}
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ position: "relative", width: 40, height: 40 }}>
                      {horseSpriteUrl && (
                        <img
                          src={horseSpriteUrl}
                          alt={horse.name}
                          style={{ width: 40, height: 40, imageRendering: "pixelated" }}
                        />
                      )}
                      <div style={{
                        position: "absolute", bottom: -2, right: -2,
                        width: 16, height: 16, borderRadius: "50%",
                        background: horse.color, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 800, color: "#fff",
                        border: "1.5px solid rgba(0,0,0,0.3)",
                      }}>
                        {gatePosition}
                      </div>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#F8FAFC" }}>
                      {horse.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
                    Gate {gatePosition} · {distance}m · <span style={{ textTransform: "capitalize" }}>{ground}</span>
                  </div>
                </div>

                {/* Provably fair badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
                    provably fair · verified
                  </span>
                </div>
              </div>

              {/* Right — horse stats panel (frosted glass) */}
              <div style={{
                width: 210, borderRadius: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                  Horse Stats
                </div>

                {/* Stat bars */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {statBar("S", horse.speed, "#06B6D4")}
                  {statBar("T", horse.stamina, "#22C55E")}
                  {statBar("F", horse.form, "#F59E0B")}
                  {statBar("C", horse.consistency, "#8B5CF6")}
                </div>

                {/* Career stats */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8, marginTop: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>{horse.careerRaces}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}>Starts</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(34,197,94,0.8)" }}>{horse.careerWins}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}>Wins</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.5)" }}>{winRate}%</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}>Win%</div>
                    </div>
                  </div>
                </div>

                {/* Last 5 results */}
                {horse.last5Results.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginRight: 2 }}>L5</span>
                    {horse.last5Results.map((r, i) => (
                      <div key={i} style={{
                        width: 22, height: 22, borderRadius: 5,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 800,
                        background: r.position === 1 ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                        border: r.position === 1 ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(255,255,255,0.06)",
                        color: r.position === 1 ? "#22C55E" : r.position <= 3 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
                      }}>
                        {r.position}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom bar */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "0 24px 14px",
            }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>
                @{username}
              </div>
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, fontStyle: "italic" }}>
                they race. you bet.
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons — below the card, not captured */}
        <div className="flex gap-3 w-full max-w-[300px]">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 py-2.5 rounded-lg bg-secondary border border-border text-sm font-bold text-foreground hover:bg-secondary/80 active:scale-[0.98] transition-all"
          >
            {downloading ? "..." : "save"}
          </button>
          <button
            onClick={handleShare}
            disabled={downloading}
            className="flex-1 py-2.5 rounded-lg bg-violet text-white text-sm font-bold hover:bg-violet/80 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <XIcon />
            {copied ? "copied! paste in tweet" : downloading ? "..." : "share"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-all"
          >
            close
          </button>
        </div>
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
