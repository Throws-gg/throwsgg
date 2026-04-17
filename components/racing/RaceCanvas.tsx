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
  raceStartsAt?: string;
  bettingClosesAt?: string;
  closedDuration?: number;
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

// Convert #RRGGBB → "r, g, b" for rgba() construction
function hexToRgbTuple(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function RaceCanvas({ entries, checkpoints, phase, timeRemaining, raceDuration, ground, raceStartsAt, bettingClosesAt, closedDuration }: RaceCanvasProps) {
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

      // Three tiers — mobile behaviour is frozen, desktop fills the
      // available viewport so the whole race fits without scrolling.
      let h: number;
      if (w < 500) {
        // Mobile — unchanged. Majority of users live here.
        h = Math.round(w * 1.0);
      } else if (w < 1100) {
        // Tablet / narrow desktop.
        h = Math.round(w * 0.62);
      } else {
        // Desktop streamer mode — height is derived from the actual
        // viewport so the canvas always fits. Chrome budget below is the
        // sum of navbar + racing-page header + wagering banner + page
        // padding + gutters, measured at ~260px with padding to spare.
        const CHROME_BUDGET = 260;
        const viewportMax = Math.max(540, window.innerHeight - CHROME_BUDGET);
        // Aspect-driven "ideal" height — still capped by viewport so we
        // never force a scroll. Using a tighter 0.58 ratio because the
        // center column is now 1400px max instead of 1800px.
        const aspectH = Math.round(w * 0.58);
        h = Math.min(aspectH, viewportMax);
      }

      setCanvasSize({ w, h });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Track a live elapsed-seconds counter that updates every animation frame.
  // This is independent of the polling-based timeRemaining which can be stale
  // or jump to 0 when the server tick is delayed.
  const raceElapsedRef = useRef(0);

  useEffect(() => {
    if (phase !== "racing" || !raceStartsAt) {
      raceElapsedRef.current = 0;
      return;
    }
    const startMs = new Date(raceStartsAt).getTime();
    let raf: number;
    function tick() {
      const elapsed = (Date.now() - startMs) / 1000;
      raceElapsedRef.current = Math.min(elapsed, raceDuration);
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => cancelAnimationFrame(raf);
  }, [phase, raceStartsAt, raceDuration]);

  // Live closed-phase countdown — derived from bettingClosesAt + closedDuration
  // rather than the polling-based timeRemaining, which can stall at 0 for
  // several seconds if the server cron is delayed on the closed→racing flip.
  const closedRemainingRef = useRef(closedDuration ?? 0);
  useEffect(() => {
    if (phase !== "closed" || !bettingClosesAt || !closedDuration) {
      closedRemainingRef.current = closedDuration ?? 0;
      return;
    }
    const endMs = new Date(bettingClosesAt).getTime() + closedDuration * 1000;
    let raf: number;
    function tick() {
      const remaining = Math.max(0, (endMs - Date.now()) / 1000);
      closedRemainingRef.current = remaining;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => cancelAnimationFrame(raf);
  }, [phase, bettingClosesAt, closedDuration]);

  const getTargetProgress = useCallback((horseId: number): number => {
    // Horses sit at the starting line (pos 0) before we have checkpoints —
    // matches checkpoint[0] so there's no snap when racing begins.
    if (!checkpoints) return 0;
    const cp = checkpoints.find(c => c.horseId === horseId);
    if (!cp) return 0;
    if (phase === "results") return cp.positions[cp.positions.length - 1];

    // Use the real elapsed time from raceStartsAt (updated every frame)
    // instead of the polling-based timeRemaining which can be stale/zero.
    const elapsed = raceStartsAt
      ? raceElapsedRef.current
      : raceDuration - timeRemaining;
    const t = Math.min(1, elapsed / raceDuration);
    const n = cp.positions.length;
    const f = t * (n - 1);
    const i = Math.floor(f);
    const frac = f - i;
    if (i >= n - 1) return cp.positions[n - 1];
    return cp.positions[i] + (cp.positions[i + 1] - cp.positions[i]) * frac;
  }, [checkpoints, phase, timeRemaining, raceDuration, raceStartsAt]);

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
    const isActive = isRacing;

    if (!isRacing && !isClosed) {
      smoothScrollRef.current = 0;
      smoothPosRef.current.clear();
    }
    // During closed phase, keep horses at starting position (no scroll)
    if (isClosed) {
      smoothScrollRef.current = 0;
    }

    // ===== TRACK LAYOUT =====
    // Editorial-quiet: no sky, no hills, no grandstand. The whole canvas is
    // the track area with lanes filling the vertical space, leaving thin
    // margins top/bottom for HUD breathing room.
    const trackTop = H * 0.08;
    const trackH = H * 0.84;
    const laneH = trackH / 8;

    // Sprite render scale — fit sprite into lane height with some padding
    const spriteScale = (laneH * 0.95) / SPRITE.FRAME_H;

    // UI scale — everything chrome-related (badges, panels, text) scales
    // against an 800px baseline. Clamped so it never shrinks on narrow
    // viewports and never gets absurdly large on ultra-wide monitors.
    // 800px → 1.0, 1400px → 1.75, 2000px → 2.5, capped at 3.0.
    const UI_SCALE = Math.max(0.9, Math.min(3.0, W / 800));

    function draw() {
      if (!ctx) return;
      const fc = ++frameRef.current;

      // Smooth per-horse position
      for (const e of entries) {
        const target = getTargetProgress(e.horseId);
        const current = smoothPosRef.current.get(e.horseId) ?? target;
        const lerped = current + (target - current) * 0.08;
        smoothPosRef.current.set(e.horseId, lerped);
      }

      // Clear
      ctx.clearRect(0, 0, W, H);

      // ===== BACKGROUND: editorial-quiet base =====
      // Base fill
      ctx.fillStyle = "#08080D";
      ctx.fillRect(0, 0, W, H);

      // Ambient violet glow top-left (radial)
      const vioGlow = ctx.createRadialGradient(
        W * 0.2, H * 0.15, 0,
        W * 0.2, H * 0.15, Math.max(W, H) * 0.55
      );
      vioGlow.addColorStop(0, "rgba(139, 92, 246, 0.18)");
      vioGlow.addColorStop(1, "rgba(139, 92, 246, 0)");
      ctx.fillStyle = vioGlow;
      ctx.fillRect(0, 0, W, H);

      // Ambient cyan glow bottom-right (radial)
      const cyGlow = ctx.createRadialGradient(
        W * 0.85, H * 0.9, 0,
        W * 0.85, H * 0.9, Math.max(W, H) * 0.5
      );
      cyGlow.addColorStop(0, "rgba(6, 182, 212, 0.14)");
      cyGlow.addColorStop(1, "rgba(6, 182, 212, 0)");
      ctx.fillStyle = cyGlow;
      ctx.fillRect(0, 0, W, H);

      // Hairline grid — 120px cells, 4% white
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      const gridStep = 120;
      ctx.beginPath();
      for (let x = 0; x <= W; x += gridStep) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
      }
      for (let y = 0; y <= H; y += gridStep) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
      }
      ctx.stroke();

      // Vignette — radial darkening pushing focus inward
      const vignette = ctx.createRadialGradient(
        W / 2, H / 2, 0,
        W / 2, H / 2, Math.max(W, H) * 0.7
      );
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(0.5, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.55)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      // ===== SCROLL CAMERA =====
      // Keep the existing scroll logic so overtaking/camera feel is preserved
      const maxProg = Math.max(...entries.map(e => smoothPosRef.current.get(e.horseId) ?? 3));
      const targetScroll = isActive ? Math.max(0, (maxProg / 100) * W * 1.2 - W * 0.5) : 0;
      smoothScrollRef.current = Math.max(
        smoothScrollRef.current,
        smoothScrollRef.current + (targetScroll - smoothScrollRef.current) * 0.05
      );
      const scrollX = smoothScrollRef.current;

      // ===== TRACK BAND =====
      // Subtle horizontal band spanning all 8 lanes. No sky, no ground.
      // Thin top/bottom hairlines frame it. No track color gradient — the
      // dust trails and horses carry the color.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      // Top rail
      ctx.beginPath();
      ctx.moveTo(0, trackTop + 0.5);
      ctx.lineTo(W, trackTop + 0.5);
      ctx.stroke();
      // Bottom rail
      ctx.beginPath();
      ctx.moveTo(0, trackTop + trackH + 0.5);
      ctx.lineTo(W, trackTop + trackH + 0.5);
      ctx.stroke();

      // Lane dividers — dashed hairlines (matches teaser)
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      for (let l = 1; l < 8; l++) {
        ctx.beginPath();
        ctx.moveTo(0, trackTop + l * laneH + 0.5);
        ctx.lineTo(W, trackTop + l * laneH + 0.5);
        ctx.stroke();
      }
      ctx.restore();

      // ===== FINISH LINE =====
      // Dashed vertical white hairline with subtle glow (teaser style).
      // Same position math as before so it lands where the engine expects.
      const finishX = (100 / 100) * W * 1.2 - scrollX + 20;
      if (finishX > -15 && finishX < W + 15) {
        ctx.save();
        ctx.shadowColor = "rgba(255, 255, 255, 0.3)";
        ctx.shadowBlur = 18;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 12]);
        ctx.beginPath();
        ctx.moveTo(finishX + 0.5, trackTop - 8);
        ctx.lineTo(finishX + 0.5, trackTop + trackH + 8);
        ctx.stroke();
        ctx.restore();

        // Faint low-alpha trailing line (the "glow" beyond the hairline)
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(finishX - 2.5, trackTop - 8);
        ctx.lineTo(finishX - 2.5, trackTop + trackH + 8);
        ctx.moveTo(finishX + 3.5, trackTop - 8);
        ctx.lineTo(finishX + 3.5, trackTop + trackH + 8);
        ctx.stroke();
        ctx.restore();
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

      // Draw back to front — trailing horses render first, so leaders
      // sit on top if they overlap.
      const sorted = [...horseData].sort((a, b) => a.pos - b.pos);

      // Identify current leader for the winner glow effect at race end
      const leaderId = sorted.length > 0 ? sorted[sorted.length - 1].entry.horseId : null;
      const isResultsPhase = phase === "results";

      for (const h of sorted) {
        const hx = (h.pos / 100) * W * 1.2 - scrollX + 30;
        const hy = trackTop + h.lane * laneH + laneH * 0.5;

        const rgb = hexToRgbTuple(h.silksColor);
        const isLeader = h.entry.horseId === leaderId;
        const winnerGlow = isResultsPhase && isLeader;

        // ===== DUST TRAIL =====
        // Horizontal blurred color gradient behind the horse.
        // Matches teaser: "linear-gradient(90deg, color00, color55)" with blur.
        if (isActive && h.pos > 3) {
          const trailLen = Math.min(140, Math.max(40, hx));
          const trailH = laneH * 0.22;
          const trailX = hx - trailLen - 10;
          const trailY = hy - trailH / 2 + laneH * 0.08;

          ctx.save();
          // Canvas filter blur — mirrors CSS filter: blur(6px)
          ctx.filter = "blur(7px)";
          const grad = ctx.createLinearGradient(trailX, 0, trailX + trailLen, 0);
          grad.addColorStop(0, `rgba(${rgb}, 0)`);
          grad.addColorStop(1, `rgba(${rgb}, 0.42)`);
          ctx.fillStyle = grad;
          ctx.fillRect(trailX, trailY, trailLen, trailH);
          ctx.restore();
        }

        // ===== SPRITE FRAME SELECTION =====
        let rowY: number;
        let frameCount: number;
        let animSpeed: number;

        if (isRacing) {
          rowY = SPRITE.ROW_GALLOP_RIGHT;
          frameCount = SPRITE.GALLOP_FRAMES;
          animSpeed = 0.15;
        } else {
          rowY = SPRITE.ROW_IDLE_RIGHT;
          frameCount = SPRITE.IDLE_FRAMES;
          animSpeed = 0.03;
        }

        // Each horse gets a lane-based offset so they don't animate in sync
        const frameIdx = Math.floor((fc * animSpeed + h.lane * 1.7) % frameCount);
        const srcX = frameIdx * SPRITE.FRAME_W;
        const srcY = rowY;

        const rw = SPRITE.FRAME_W * spriteScale;
        const rh = SPRITE.FRAME_H * spriteScale;
        const drawX = hx - rw * 0.3;
        const drawY = hy - rh * 0.6;

        // ===== DROP-SHADOW GLOW =====
        // ctx.shadowBlur applies to the next drawImage calls. We set a
        // soft dark shadow for every horse for depth; winner gets an
        // additional colored glow on top.
        ctx.save();
        ctx.shadowColor = winnerGlow
          ? `rgba(${rgb}, 0.9)`
          : "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = winnerGlow ? 28 : 10;
        ctx.shadowOffsetY = winnerGlow ? 0 : 3;

        ctx.imageSmoothingEnabled = false;

        // Draw body
        const bodyImg = loadImage(h.paths.body);
        if (bodyImg.complete) {
          ctx.drawImage(
            bodyImg,
            srcX, srcY, SPRITE.FRAME_W, SPRITE.FRAME_H,
            drawX, drawY, rw, rh
          );
        }
        // Draw hair
        const hairImg = loadImage(h.paths.hair);
        if (hairImg.complete) {
          ctx.drawImage(
            hairImg,
            srcX, srcY, SPRITE.FRAME_W, SPRITE.FRAME_H,
            drawX, drawY, rw, rh
          );
        }
        // Draw face marking
        if (h.paths.face) {
          const faceImg = loadImage(h.paths.face);
          if (faceImg.complete) {
            ctx.drawImage(
              faceImg,
              srcX, srcY, SPRITE.FRAME_W, SPRITE.FRAME_H,
              drawX, drawY, rw, rh
            );
          }
        }
        ctx.imageSmoothingEnabled = true;
        ctx.restore();

        // ===== GATE BADGE =====
        // Restyled: dark pill with thin silks-color border + white number.
        // Scales with UI so it's legible on streamer-sized canvases.
        const badgeX = hx;
        const numW = Math.round(18 * UI_SCALE);
        const numH = Math.round(14 * UI_SCALE);
        const badgeY = drawY + Math.round(4 * UI_SCALE);
        const badgeFontSize = Math.round(10 * UI_SCALE);
        ctx.save();
        ctx.fillStyle = "rgba(8, 8, 13, 0.85)";
        ctx.beginPath();
        ctx.roundRect(badgeX - numW / 2, badgeY - numH, numW, numH, 3 * UI_SCALE);
        ctx.fill();
        ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
        ctx.lineWidth = Math.max(1, UI_SCALE);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.font = `900 ${badgeFontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(h.entry.gatePosition), badgeX, badgeY - numH / 2 + 0.5);
        ctx.restore();
      }

      // ===== WEATHER (kept — still a real state indicator) =====
      if (ground === "heavy") {
        ctx.save();
        ctx.strokeStyle = "rgba(160, 180, 210, 0.12)";
        ctx.lineWidth = 0.8;
        for (let r = 0; r < 50; r++) {
          const rx = ((fc * 1.5 + r * 41) % W);
          const ry = ((fc * 4 + r * 29) % H);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 4, ry + 10);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(0, 0, 20, 0.05)";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } else if (ground === "soft") {
        ctx.save();
        ctx.strokeStyle = "rgba(160, 180, 210, 0.07)";
        ctx.lineWidth = 0.6;
        for (let r = 0; r < 20; r++) {
          const rx = ((fc * 1.2 + r * 67) % W);
          const ry = ((fc * 3 + r * 43) % H);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 3, ry + 7);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ===== GATES COUNTDOWN OVERLAY =====
      if (isClosed) {
        // Use the live per-frame countdown so the number never stalls at 0
        // while waiting for the server cron to flip state to "racing".
        const liveRemaining = bettingClosesAt && closedDuration
          ? closedRemainingRef.current
          : timeRemaining;
        const shownSeconds = Math.max(0, Math.ceil(liveRemaining));

        // Semi-transparent dark scrim
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(0, 0, W, H);

        // Countdown number — scales with canvas, no cap on desktop so
        // streamers get a huge readable timer.
        const countdownSize = Math.min(W * 0.16, 280);
        ctx.save();
        ctx.font = `900 ${countdownSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (shownSeconds <= 3) {
          ctx.shadowColor = "rgba(245, 158, 11, 0.7)";
          ctx.shadowBlur = 48;
          ctx.fillStyle = "#F59E0B";
        } else {
          ctx.shadowColor = "rgba(139, 92, 246, 0.5)";
          ctx.shadowBlur = 32;
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        }
        ctx.fillText(String(shownSeconds), W / 2, H * 0.42);
        ctx.restore();

        // Label — uppercase, wide-tracked, muted
        const labelSize = Math.min(W * 0.022, 32);
        ctx.save();
        ctx.font = `700 ${labelSize}px sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Manual letter-spacing by drawing chars individually
        const label = shownSeconds <= 3 ? "STARTING" : "GATES LOADING";
        const spacing = labelSize * 0.28;
        const charWidths = Array.from(label).map(c => ctx.measureText(c).width);
        const totalW = charWidths.reduce((a, b) => a + b, 0) + spacing * (label.length - 1);
        let cx = W / 2 - totalW / 2;
        for (let i = 0; i < label.length; i++) {
          ctx.textAlign = "left";
          ctx.fillText(label[i], cx, H * 0.42 + countdownSize * 0.62);
          cx += charWidths[i] + spacing;
        }
        ctx.restore();
      }

      // ===== POSITION OVERLAY (leaderboard) =====
      if (isRacing) {
        const leaderboard = [...horseData].sort((a, b) => b.pos - a.pos);

        // Everything scales from UI_SCALE so the panel stays legible at
        // streamer canvas sizes without overwhelming mobile.
        const panelPadX = Math.round(10 * UI_SCALE);
        const panelPadY = Math.round(10 * UI_SCALE);
        const rowH = Math.round(18 * UI_SCALE);
        const panelW = Math.round(116 * UI_SCALE);
        const panelH = leaderboard.length * rowH + panelPadY * 2;
        const panelX = W - panelW - Math.round(6 * UI_SCALE);
        const panelY = Math.round(12 * UI_SCALE);
        const numFont = Math.round(11 * UI_SCALE);
        const nameFont = Math.round(11 * UI_SCALE);
        const swatchW = Math.round(6 * UI_SCALE);
        const swatchH = Math.round(12 * UI_SCALE);
        const pipR = Math.max(2, Math.round(3 * UI_SCALE));

        ctx.save();

        // Panel background — dark card with thin hairline border (teaser style)
        ctx.fillStyle = "rgba(15, 15, 24, 0.82)";
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 8 * UI_SCALE);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        leaderboard.forEach((h, i) => {
          const ry = panelY + panelPadY + i * rowH + rowH / 2;
          const rgb = hexToRgbTuple(h.silksColor);

          // Color swatch
          ctx.fillStyle = h.silksColor;
          ctx.beginPath();
          ctx.roundRect(
            panelX + panelPadX,
            ry - swatchH / 2,
            swatchW,
            swatchH,
            Math.max(1.5, UI_SCALE * 1.5)
          );
          ctx.fill();

          // Gate number
          ctx.fillStyle =
            i === 0
              ? "rgba(255, 255, 255, 0.95)"
              : "rgba(255, 255, 255, 0.4)";
          ctx.font = `900 ${numFont}px ui-monospace, monospace`;
          ctx.fillText(
            String(h.entry.gatePosition).padStart(2, "0"),
            panelX + panelPadX + swatchW + Math.round(6 * UI_SCALE),
            ry
          );

          // Horse name (first word only to fit)
          ctx.fillStyle =
            i === 0
              ? "rgba(255, 255, 255, 0.9)"
              : "rgba(255, 255, 255, 0.35)";
          ctx.font = `700 ${nameFont}px sans-serif`;
          const firstName = h.entry.horse.name.split(" ")[0];
          ctx.fillText(
            firstName.toUpperCase(),
            panelX + panelPadX + swatchW + Math.round(28 * UI_SCALE),
            ry
          );

          // Leader pip — glowing dot in silks colour on rank 1
          if (i === 0) {
            ctx.fillStyle = `rgba(${rgb}, 1)`;
            ctx.shadowColor = `rgba(${rgb}, 0.9)`;
            ctx.shadowBlur = 8 * UI_SCALE;
            ctx.beginPath();
            ctx.arc(
              panelX + panelW - Math.round(12 * UI_SCALE),
              ry,
              pipR,
              0,
              Math.PI * 2
            );
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        });

        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [canvasSize, entries, phase, timeRemaining, raceDuration, ground, getTargetProgress, bettingClosesAt, closedDuration]);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl border border-white/[0.06] overflow-hidden bg-[#08080D] w-full"
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: canvasSize.h, display: "block" }}
      />
    </div>
  );
}
