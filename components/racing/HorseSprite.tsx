"use client";

import { useRef, useEffect } from "react";
import { getHorseIdentity, SPRITE } from "@/lib/racing/constants";

interface HorseSpriteProps {
  slug: string;
  size?: number; // rendered size in px (square)
  className?: string;
}

const imageCache = new Map<string, HTMLImageElement>();

function loadImg(src: string): HTMLImageElement {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  return img;
}

export function HorseSprite({ slug, size = 32, className }: HorseSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const identity = getHorseIdentity(slug);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const bodyPath = `/horses/bodies/${identity.body}.png`;
    const hairPath = `/horses/${identity.hairType}-hair/${identity.hairColor}.png`;
    const facePath = identity.faceMarking > 0 ? `/horses/face-markings/${identity.faceMarking}.png` : null;

    const bodyImg = loadImg(bodyPath);
    const hairImg = loadImg(hairPath);
    const faceImg = facePath ? loadImg(facePath) : null;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;

      // Crop a tight window around the horse that keeps the legs intact.
      // The full frame is 64×48 but the horse sits off-centre with empty space
      // on the left + top. We crop to 40×40 starting at (12, 4) — this catches
      // the full body + hooves (which extend to y≈46) without trimming.
      const cropX = 12;
      const cropY = 4;
      const cropW = 40;
      const cropH = 40;

      const srcX = cropX;
      const srcY = SPRITE.ROW_IDLE_RIGHT + cropY;

      // Letterbox the horse into the square canvas so it never gets squashed.
      // The crop is already square (40×40), so this is a 1:1 scale — but we
      // render slightly inset so the hooves don't kiss the bottom edge.
      const inset = Math.round(size * 0.04);
      const drawW = size - inset * 2;
      const drawH = size - inset * 2;
      const dx = inset;
      const dy = inset;

      if (bodyImg.complete) ctx.drawImage(bodyImg, srcX, srcY, cropW, cropH, dx, dy, drawW, drawH);
      if (hairImg.complete) ctx.drawImage(hairImg, srcX, srcY, cropW, cropH, dx, dy, drawW, drawH);
      if (faceImg?.complete) ctx.drawImage(faceImg, srcX, srcY, cropW, cropH, dx, dy, drawW, drawH);
    }

    // Draw immediately if loaded, otherwise wait
    let loaded = 0;
    const total = faceImg ? 3 : 2;

    function onLoad() {
      loaded++;
      if (loaded >= total) draw();
    }

    // Check if already loaded
    if (bodyImg.complete) loaded++; else bodyImg.addEventListener("load", onLoad, { once: true });
    if (hairImg.complete) loaded++; else hairImg.addEventListener("load", onLoad, { once: true });
    if (faceImg) {
      if (faceImg.complete) loaded++; else faceImg.addEventListener("load", onLoad, { once: true });
    }

    if (loaded >= total) draw();
  }, [slug, size, identity]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, display: "block" }}
    />
  );
}
