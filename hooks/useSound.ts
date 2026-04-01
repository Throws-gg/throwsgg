"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Howl } from "howler";

type SoundName =
  | "bet_placed"
  | "bet_confirmed"
  | "countdown_tick"
  | "countdown_final"
  | "battle_whoosh"
  | "collision_impact"
  | "win_small"
  | "win_medium"
  | "win_big"
  | "loss"
  | "draw_push"
  | "chat_message"
  | "new_round";

// File names — drop your downloaded files in public/sounds/ with these names
const SOUND_CONFIG: Record<SoundName, { src: string; volume: number }> = {
  bet_placed:       { src: "/sounds/bet-placed.mp3",       volume: 0.4 },
  bet_confirmed:    { src: "/sounds/bet-confirmed.mp3",    volume: 0.4 },
  countdown_tick:   { src: "/sounds/countdown-tick.mp3",   volume: 0.3 },
  countdown_final:  { src: "/sounds/countdown-final.mp3",  volume: 0.5 },
  battle_whoosh:    { src: "/sounds/battle-whoosh.mp3",    volume: 0.6 },
  collision_impact: { src: "/sounds/collision-impact.mp3", volume: 0.7 },
  win_small:        { src: "/sounds/win-small.mp3",        volume: 0.4 },
  win_medium:       { src: "/sounds/win-medium.mp3",       volume: 0.5 },
  win_big:          { src: "/sounds/win-big.mp3",          volume: 0.7 },
  loss:             { src: "/sounds/loss.mp3",             volume: 0.2 },
  draw_push:        { src: "/sounds/draw-push.mp3",        volume: 0.3 },
  chat_message:     { src: "/sounds/chat-message.mp3",     volume: 0.15 },
  new_round:        { src: "/sounds/new-round.mp3",        volume: 0.3 },
};

// Singleton — sounds are shared across all hook instances
let globalSounds: Map<SoundName, Howl> | null = null;
let globalMuted = true; // OFF by default (browser autoplay policy)

function ensureLoaded() {
  if (globalSounds) return;
  globalSounds = new Map();

  for (const [name, config] of Object.entries(SOUND_CONFIG)) {
    globalSounds.set(name as SoundName, new Howl({
      src: [config.src],
      volume: config.volume,
      preload: true,
    }));
  }
}

export function useSound() {
  const [muted, setMutedState] = useState(globalMuted);

  const play = useCallback((name: SoundName) => {
    if (globalMuted) return;
    if (!globalSounds) return;
    const sound = globalSounds.get(name);
    if (sound) {
      sound.stop(); // Stop any currently playing instance
      sound.play();
    }
  }, []);

  const playWin = useCallback((amount: number) => {
    if (amount >= 50) play("win_big");
    else if (amount >= 10) play("win_medium");
    else play("win_small");
  }, [play]);

  const toggleMute = useCallback(() => {
    if (globalMuted) {
      // Unmuting — load sounds on first unmute
      ensureLoaded();
      globalMuted = false;
      setMutedState(false);
    } else {
      globalMuted = true;
      setMutedState(true);
      // Stop all playing sounds
      if (globalSounds) {
        globalSounds.forEach((s) => s.stop());
      }
    }
  }, []);

  return { play, playWin, muted, toggleMute };
}
