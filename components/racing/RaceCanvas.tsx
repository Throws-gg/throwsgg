"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { RaceEntry, RacePhase, HorseIdentity } from "@/lib/racing/constants";
import { getHorseIdentity, SPRITE } from "@/lib/racing/constants";

interface RaceCanvasProps {
  entries: RaceEntry[];
  checkpoints?: { horseId: number; positions: number[] }[];
  phase: RacePhase;
  timeRemaining: number;
  raceDuration: number;
  ground: string;
}

// ===== SPRITE IMAGE CACHE =====
// Global cache so images survive re-renders / re-mounts
const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): HTMLImageElement {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  return img;
}

function getSpritePaths(identity: HorseIdentity) {
  const body = `/horses/bodies/${identity.body}.png`;
  const hair = `/horses/${identity.hairType}-hair/${identity.hairColor}.png`;
  const face = identity.faceMarking > 0 ? `/horses/face-markings/${identity.faceMarking}.png` : null;
  return { body, hair, face };
}

export function RaceCanvas({ entries, checkpoints, phase, timeRemaining, raceDuration, ground }: RaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const frameRef = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 400 });

  const smoothPosRef = useRef<Map<number, number>>(new Map());
  const smoothScrollRef = useRef(0);

  // Preload all sprite sheets for current entries
  useEffect(() => {
    for (const e of entries) {
      const identity = getHorseIdentity(e.horse.slug);
      const paths = getSpritePaths(identity);
      loadImage(paths.body);
      loadImage(paths.hair);
      if (paths.face) loadImage(paths.face);
    }
  }, [entries]);

  // Use a container ref to measure actual available width
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function resize() {
      const container = containerRef.current;
      const w = container ? container.clientWidth : Math.min(900, window.innerWidth - 32);
      const isMobile = w < 500;
      setCanvasSize({ w, h: isMobile ? Math.round(w * 1.0) : Math.round(w * 0.55) });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getTargetProgress = useCallback((horseId: number): number => {
    if (!checkpoints) return 3;
    const cp = checkpoints.find(c => c.horseId === horseId);
    if (!cp) return 3;
    if (phase === "results") return cp.positions[cp.positions.length - 1];

    const elapsed = raceDuration - timeRemaining;
    const t = Math.min(1, elapsed / raceDuration);
    const n = cp.positions.length;
    const f = t * (n - 1);
    const i = Math.floor(f);
    const frac = f - i;
    if (i >= n - 1) return cp.positions[n - 1];
    return cp.positions[i] + (cp.positions[i + 1] - cp.positions[i]) * frac;
  }, [checkpoints, phase, timeRemaining, raceDuration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvasSize.w;
    const H = canvasSize.h;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.scale(DPR, DPR);

    const isRacing = phase === "racing" || phase === "results";
    const isClosed = phase === "closed";
    const isActive = isRacing; // for scrolling/dust purposes
    const isTurf = ground !== "firm";

    if (!isRacing && !isClosed) {
      smoothScrollRef.current = 0;
      smoothPosRef.current.clear();
    }
    // During closed phase, keep horses at starting position (no scroll)
    if (isClosed) {
      smoothScrollRef.current = 0;
    }

    const skyH = H * 0.3;
    const trackTop = skyH + H * 0.05;
    const trackH = H * 0.6;
    const laneH = trackH / 8;

    // Sprite render scale — fit sprite into lane height with some padding
    const spriteScale = (laneH * 0.95) / SPRITE.FRAME_H;

    function draw() {
      if (!ctx) return;
      const fc = ++frameRef.current;

      for (const e of entries) {
        const target = getTargetProgress(e.horseId);
        const current = smoothPosRef.current.get(e.horseId) ?? target;
        const lerped = current + (target - current) * 0.08;
        smoothPosRef.current.set(e.horseId, lerped);
      }

      ctx.clearRect(0, 0, W, H);

      // ===== SKY =====
      const sky = ctx.createLinearGradient(0, 0, 0, skyH);
      sky.addColorStop(0, "#0f1520");
      sky.addColorStop(1, "#1a2030");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, skyH + 20);

      // Stars
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 0; i < 30; i++) {
        const sx = (i * 97 + 13) % W;
        const sy = (i * 43 + 7) % (skyH - 10);
        ctx.beginPath();
        ctx.arc(sx, sy, i % 3 === 0 ? 1.2 : 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Scroll
      const maxProg = Math.max(...entries.map(e => smoothPosRef.current.get(e.horseId) ?? 3));
      const targetScroll = isActive ? Math.max(0, (maxProg / 100) * W * 1.2 - W * 0.5) : 0;
      smoothScrollRef.current = Math.max(
        smoothScrollRef.current,
        smoothScrollRef.current + (targetScroll - smoothScrollRef.current) * 0.05
      );
      const scrollX = smoothScrollRef.current;

      // ===== DISTANT HILLS =====
      ctx.fillStyle = "#141f14";
      ctx.beginPath();
      ctx.moveTo(0, skyH);
      for (let x = 0; x <= W; x += 3) {
        const hx = x + scrollX * 0.06;
        ctx.lineTo(x, skyH - 8 + Math.sin(hx * 0.006) * 10 + Math.sin(hx * 0.015) * 4);
      }
      ctx.lineTo(W, skyH + 15);
      ctx.lineTo(0, skyH + 15);
      ctx.fill();

      // ===== TREES =====
      for (let i = 0; i < 18; i++) {
        const tx = ((i * 110 + 40) - scrollX * 0.12) % (W + 200) - 60;
        const ty = skyH + 2 + (i % 3) * 4;
        ctx.fillStyle = "#2a1a0a";
        ctx.fillRect(tx - 1.5, ty, 3, 10);
        ctx.fillStyle = i % 2 ? "#1a3a1a" : "#224422";
        ctx.beginPath();
        ctx.ellipse(tx, ty - 1, 8 + (i % 4) * 2, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== GRANDSTAND =====
      const gsX = W * 0.65 - scrollX * 0.15;
      if (gsX > -180 && gsX < W + 30) {
        ctx.fillStyle = "#22222e";
        ctx.fillRect(gsX, skyH - 2, 130, 22);
        ctx.fillStyle = "#1a1a24";
        ctx.beginPath();
        ctx.moveTo(gsX - 3, skyH - 2);
        ctx.lineTo(gsX + 65, skyH - 12);
        ctx.lineTo(gsX + 133, skyH - 2);
        ctx.fill();
        ctx.strokeStyle = "#c0963060";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gsX - 3, skyH - 2);
        ctx.lineTo(gsX + 65, skyH - 12);
        ctx.lineTo(gsX + 133, skyH - 2);
        ctx.stroke();
        if (isActive) {
          const cols = ["#e63946", "#457b9d", "#f0c040", "#2d6a4f", "#e9c46a", "#fff"];
          for (let s = 0; s < 24; s++) {
            ctx.fillStyle = cols[s % cols.length] + "90";
            ctx.beginPath();
            ctx.arc(
              gsX + 6 + (s % 12) * 10,
              skyH + 3 + Math.floor(s / 12) * 8 + Math.sin(fc * 0.12 + s * 0.8) * 1.5,
              1.8, 0, Math.PI * 2
            );
            ctx.fill();
          }
        }
      }

      // ===== TRACK =====
      const trackGrad = ctx.createLinearGradient(0, trackTop, 0, trackTop + trackH);
      if (isTurf) {
        trackGrad.addColorStop(0, "#2a5428");
        trackGrad.addColorStop(0.5, "#305830");
        trackGrad.addColorStop(1, "#284e26");
      } else {
        trackGrad.addColorStop(0, "#5a4a38");
        trackGrad.addColorStop(1, "#4a3a28");
      }
      ctx.fillStyle = trackGrad;
      ctx.fillRect(0, trackTop, W, trackH);

      // Mow stripes
      for (let s = 0; s < 30; s++) {
        const sx = ((s * 45) - scrollX) % (W + 100) - 50;
        ctx.fillStyle = s % 2 ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)";
        ctx.fillRect(sx, trackTop, 22, trackH);
      }

      // Lane lines
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 0.5;
      for (let l = 1; l < 8; l++) {
        ctx.beginPath();
        ctx.moveTo(0, trackTop + l * laneH);
        ctx.lineTo(W, trackTop + l * laneH);
        ctx.stroke();
      }

      // Rails
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, trackTop); ctx.lineTo(W, trackTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, trackTop + trackH); ctx.lineTo(W, trackTop + trackH); ctx.stroke();

      // Rail posts
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.5;
      for (let fp = 0; fp < W / 35 + 2; fp++) {
        const fpx = ((fp * 35) - scrollX) % (W + 70) - 35;
        ctx.beginPath(); ctx.moveTo(fpx, trackTop - 5); ctx.lineTo(fpx, trackTop + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fpx, trackTop + trackH - 5); ctx.lineTo(fpx, trackTop + trackH + 5); ctx.stroke();
      }

      // Finish line
      const finishX = (100 / 100) * W * 1.2 - scrollX + 20;
      if (finishX > -15 && finishX < W + 15) {
        const sq = 5;
        const rows = Math.floor(trackH / sq);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 2; c++) {
            ctx.fillStyle = ((r + c) % 2 === 0) ? "#fff" : "#000";
            ctx.fillRect(finishX + c * sq, trackTop + r * sq, sq, sq);
          }
        }
      }

      // ===== HORSES =====
      const horseData = entries.map((e, i) => {
        const identity = getHorseIdentity(e.horse.slug);
        const paths = getSpritePaths(identity);
        return {
          entry: e,
          pos: smoothPosRef.current.get(e.horseId) ?? 3,
          lane: i,
          identity,
          paths,
          silksColor: e.horse.color,
        };
      });

      // Draw back to front
      const sorted = [...horseData].sort((a, b) => a.pos - b.pos);

      for (const h of sorted) {
        const hx = (h.pos / 100) * W * 1.2 - scrollX + 30;
        const hy = trackTop + h.lane * laneH + laneH * 0.5;

        // Dust puffs
        if (isActive && h.pos > 5) {
          const dustCol = isTurf ? "rgba(80,100,60," : "rgba(140,120,90,";
          for (let d = 0; d < 4; d++) {
            const age = (fc + d * 7 + h.lane * 3) % 20;
            const alpha = Math.max(0, 0.2 - age * 0.01);
            ctx.fillStyle = dustCol + alpha + ")";
            ctx.beginPath();
            ctx.arc(hx - 20 - d * 6 - age * 0.5, hy + 8, 2.5 - age * 0.08, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Determine animation row and frame
        let rowY: number;
        let frameCount: number;
        let animSpeed: number;

        if (isRacing) {
          rowY = SPRITE.ROW_GALLOP_RIGHT;
          frameCount = SPRITE.GALLOP_FRAMES;
          animSpeed = 0.15;
        } else {
          // Idle animation for closed/betting phase
          rowY = SPRITE.ROW_IDLE_RIGHT;
          frameCount = SPRITE.IDLE_FRAMES;
          animSpeed = 0.03;
        }

        // Each horse gets a lane-based offset so they don't animate in sync
        const frameIdx = Math.floor((fc * animSpeed + h.lane * 1.7) % frameCount);
        const srcX = frameIdx * SPRITE.FRAME_W;
        const srcY = rowY;

        // Rendered size
        const rw = SPRITE.FRAME_W * spriteScale;
        const rh = SPRITE.FRAME_H * spriteScale;

        // Position: center sprite vertically in lane, offset horizontally so head is at hx
        const drawX = hx - rw * 0.3;
        const drawY = hy - rh * 0.6;

        // Draw shadow
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(hx, hy + rh * 0.3, rw * 0.35, rh * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();

        // Enable pixel-art rendering (nearest neighbor)
        ctx.imageSmoothingEnabled = false;

        // Draw body sprite
        const bodyImg = loadImage(h.paths.body);
        if (bodyImg.complete) {
          ctx.drawImage(bodyImg, srcX, srcY, SPRITE.FRAME_W, SPRITE.FRAME_H, drawX, drawY, rw, rh);
        }

        // Draw hair overlay (same frame position — sheets are aligned)
        const hairImg = loadImage(h.paths.hair);
        if (hairImg.complete) {
          ctx.drawImage(hairImg, srcX, srcY, SPRITE.FRAME_W, SPRITE.FRAME_H, drawX, drawY, rw, rh);
        }

        // Draw face marking overlay
        if (h.paths.face) {
          const faceImg = loadImage(h.paths.face);
          if (faceImg.complete) {
            ctx.drawImage(faceImg, srcX, srcY, SPRITE.FRAME_W, SPRITE.FRAME_H, drawX, drawY, rw, rh);
          }
        }

        // Re-enable smoothing for UI elements
        ctx.imageSmoothingEnabled = true;

        // Gate number badge — tucked close to top of sprite
        const badgeX = hx;
        const badgeY = drawY + 2;
        ctx.fillStyle = h.silksColor + "CC";
        const numW = 12;
        const numH = 10;
        ctx.beginPath();
        ctx.roundRect(badgeX - numW / 2, badgeY - numH, numW, numH, 2.5);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(h.entry.gatePosition), badgeX, badgeY - numH / 2);
      }

      // ===== WEATHER =====
      if (ground === "heavy") {
        for (let r = 0; r < 50; r++) {
          const rx = ((fc * 1.5 + r * 41) % W);
          const ry = ((fc * 4 + r * 29) % H);
          ctx.strokeStyle = "rgba(160,180,210,0.15)";
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 10); ctx.stroke();
        }
        ctx.fillStyle = "rgba(0,0,20,0.06)";
        ctx.fillRect(0, 0, W, H);
      } else if (ground === "soft") {
        for (let r = 0; r < 20; r++) {
          const rx = ((fc * 1.2 + r * 67) % W);
          const ry = ((fc * 3 + r * 43) % H);
          ctx.strokeStyle = "rgba(160,180,210,0.08)";
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 7); ctx.stroke();
        }
      }

      // ===== GATES COUNTDOWN OVERLAY =====
      if (isClosed) {
        // Semi-transparent overlay
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(0, 0, W, H);

        // Countdown number
        const countdownSize = Math.min(W * 0.15, 80);
        ctx.font = `900 ${countdownSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Glow effect
        if (timeRemaining <= 3) {
          ctx.shadowColor = "rgba(245,158,11,0.6)";
          ctx.shadowBlur = 30;
          ctx.fillStyle = "#F59E0B";
        } else {
          ctx.shadowColor = "rgba(255,255,255,0.3)";
          ctx.shadowBlur = 20;
          ctx.fillStyle = "rgba(255,255,255,0.9)";
        }
        ctx.fillText(String(timeRemaining), W / 2, H * 0.42);

        // Reset shadow
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Label
        ctx.font = `700 ${Math.min(W * 0.025, 12)}px sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.letterSpacing = "0.2em";
        ctx.fillText(timeRemaining <= 3 ? "STARTING" : "GATES LOADING", W / 2, H * 0.42 + countdownSize * 0.6);
      }

      // ===== POSITION OVERLAY =====
      if (isRacing) {
        const leaderboard = [...horseData].sort((a, b) => b.pos - a.pos);
        const panelW = 88;
        const rowH = 13;
        const panelH = leaderboard.length * rowH + 8;
        const panelX = W - panelW - 6;
        const panelY = 4;

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 4);
        ctx.fill();

        ctx.font = "bold 8px monospace";
        ctx.textAlign = "left";
        leaderboard.forEach((h, i) => {
          const ry = panelY + 5 + i * rowH;
          ctx.fillStyle = h.silksColor;
          ctx.beginPath();
          ctx.roundRect(panelX + 4, ry, 6, 9, 1.5);
          ctx.fill();
          ctx.fillStyle = i === 0 ? "rgba(255,220,80,0.9)" : "rgba(255,255,255,0.5)";
          ctx.fillText(`${h.entry.gatePosition}`, panelX + 14, ry + 8);
          ctx.fillStyle = i === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)";
          ctx.fillText(h.entry.horse.name.split(" ")[0], panelX + 24, ry + 8);
        });
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [canvasSize, entries, phase, timeRemaining, raceDuration, ground, getTargetProgress]);

  return (
    <div ref={containerRef} className="rounded-2xl border border-white/[0.06] overflow-hidden bg-[#080810] w-full">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: canvasSize.h, display: "block" }}
      />
    </div>
  );
}
