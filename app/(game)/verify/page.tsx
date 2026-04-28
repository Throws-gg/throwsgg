"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  verifyRaceOutcome,
  verifyServerSeedHash,
  type VerifyFinish,
} from "@/lib/racing/provably-fair-browser";
import type { GroundCondition, RaceDistance } from "@/lib/racing/constants";

// ======= TYPES =======

interface VerifyRaceData {
  race: {
    id: string;
    raceNumber: number;
    distance: number;
    ground: string;
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    winningHorseId: number;
    commentary: string | null;
  };
  entries: {
    horseId: number;
    gatePosition: number;
    finishPosition: number | null;
    margin: number | null;
    horse: {
      id: number;
      name: string;
      slug: string;
      color: string;
      speed: number;
      stamina: number;
      form: number;
      consistency: number;
      groundPreference: GroundCondition;
    };
  }[];
}

interface VerifyResult {
  hashValid: boolean;
  computedFinish: VerifyFinish[];
  serverFinish: { horseId: number; finishPosition: number }[];
  matches: boolean;
}

// ======= MAIN PAGE =======

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const [raceInput, setRaceInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raceData, setRaceData] = useState<VerifyRaceData | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const autoVerifiedRef = useRef(false);

  const handleVerify = useCallback(async () => {
    setError(null);
    setResult(null);
    setRaceData(null);

    const raceNumber = parseInt(raceInput.trim());
    if (!raceNumber || isNaN(raceNumber)) {
      setError("Enter a valid race number");
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch race data from public verify endpoint
      const res = await fetch(`/api/race/verify?raceNumber=${raceNumber}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Race not found");
        setLoading(false);
        return;
      }

      setRaceData(data);

      // 2. Verify the revealed seed hashes to the committed hash
      const hashValid = await verifyServerSeedHash(
        data.race.serverSeed,
        data.race.serverSeedHash
      );

      // 3. Re-run the simulation deterministically
      const horses = data.entries.map((e: VerifyRaceData["entries"][0]) => ({
        id: e.horse.id,
        name: e.horse.name,
        speed: e.horse.speed,
        stamina: e.horse.stamina,
        form: e.horse.form,
        consistency: e.horse.consistency,
        groundPreference: e.horse.groundPreference,
      }));

      const computedFinish = await verifyRaceOutcome(
        data.race.serverSeed,
        data.race.clientSeed,
        data.race.nonce,
        horses,
        data.race.distance as RaceDistance,
        data.race.ground as GroundCondition
      );

      // 4. Compare computed vs server-recorded finish order
      const serverFinish = data.entries
        .filter((e: VerifyRaceData["entries"][0]) => e.finishPosition !== null)
        .map((e: VerifyRaceData["entries"][0]) => ({
          horseId: e.horseId,
          finishPosition: e.finishPosition!,
        }))
        .sort((a: { finishPosition: number }, b: { finishPosition: number }) => a.finishPosition - b.finishPosition);

      const matches =
        hashValid &&
        computedFinish.length === serverFinish.length &&
        computedFinish.every(
          (c, i) =>
            c.horseId === serverFinish[i].horseId &&
            c.finishPosition === serverFinish[i].finishPosition
        );

      setResult({ hashValid, computedFinish, serverFinish, matches });
    } catch (err) {
      console.error(err);
      setError("Verification failed. Please try again.");
    }
    setLoading(false);
  }, [raceInput]);

  // Deep-link support: /verify?race=1234 prefills the input and auto-runs once.
  useEffect(() => {
    if (autoVerifiedRef.current) return;
    const fromQuery = searchParams.get("race");
    if (!fromQuery) return;
    autoVerifiedRef.current = true;
    setRaceInput(fromQuery);
  }, [searchParams]);

  // Once raceInput is set from the query param, fire the verify automatically.
  useEffect(() => {
    if (!autoVerifiedRef.current) return;
    if (!raceInput || loading || raceData || result) return;
    handleVerify();
    // intentionally only fires when raceInput first arrives from the query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceInput]);

  return (
    <div className="max-w-2xl mx-auto p-4 py-6 space-y-5 pb-20 md:pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Provably Fair</h1>
        <p className="text-sm text-white/30 mt-0.5">
          Verify any race outcome yourself. All the math, none of the trust.
        </p>
      </div>

      {/* Input card */}
      <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
            Race number
          </label>
          <Input
            type="number"
            placeholder="e.g. 1284"
            value={raceInput}
            onChange={(e) => setRaceInput(e.target.value)}
            className="bg-white/[0.04] border-white/[0.08]"
          />
        </div>
        <Button
          onClick={handleVerify}
          disabled={loading || !raceInput.trim()}
          className="w-full bg-violet hover:bg-violet/80 text-white font-bold"
        >
          {loading ? "Verifying..." : "Verify this race"}
        </Button>
        {error && (
          <p className="text-xs text-red text-center">{error}</p>
        )}
      </div>

      {/* Results */}
      {result && raceData && (
        <div className="space-y-4">
          {/* Banner */}
          <div
            className={cn(
              "rounded-xl border p-4 flex items-center gap-3",
              result.matches
                ? "border-green/30 bg-green/[0.06]"
                : "border-red/30 bg-red/[0.06]"
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-xl font-black shrink-0",
                result.matches ? "bg-green/20 text-green" : "bg-red/20 text-red"
              )}
            >
              {result.matches ? "✓" : "✗"}
            </div>
            <div>
              <p className="text-sm font-black text-white">
                {result.matches ? "Verified — race is legitimate" : "Mismatch detected"}
              </p>
              <p className="text-[11px] text-white/50">
                {result.matches
                  ? "Your computed finish order matches the server's published result."
                  : "The computed finish order does not match. Something is off."}
              </p>
            </div>
          </div>

          {/* Hash check */}
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-3">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
              Step 1: Hash commitment
            </p>
            <p className="text-xs text-white/60">
              The server committed to the hash <span className="font-mono">{raceData.race.serverSeedHash.substring(0, 16)}…</span> before the race started.
              SHA-256 of the revealed seed{" "}
              <span
                className={
                  result.hashValid ? "text-green font-bold" : "text-red font-bold"
                }
              >
                {result.hashValid ? "matches" : "does NOT match"}
              </span>
              .
            </p>
            <div className="rounded-lg bg-black/30 border border-white/[0.05] p-3 space-y-1.5 font-mono text-[10px]">
              <div>
                <span className="text-white/40">server_seed: </span>
                <span className="text-white/80 break-all">{raceData.race.serverSeed}</span>
              </div>
              <div>
                <span className="text-white/40">expected_hash: </span>
                <span className="text-white/80 break-all">{raceData.race.serverSeedHash}</span>
              </div>
            </div>
          </div>

          {/* Simulation inputs */}
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-3">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
              Step 2: Deterministic replay
            </p>
            <p className="text-xs text-white/60">
              Using <span className="font-mono">HMAC_SHA256(serverSeed, clientSeed:nonce:horse:i:n)</span>{" "}
              to derive each horse's random factors, then applying the power-score formula
              with the published horse stats.
            </p>
            <div className="rounded-lg bg-black/30 border border-white/[0.05] p-3 space-y-1.5 font-mono text-[10px]">
              <div><span className="text-white/40">client_seed: </span><span className="text-white/80">{raceData.race.clientSeed}</span></div>
              <div><span className="text-white/40">nonce: </span><span className="text-white/80">{raceData.race.nonce}</span></div>
              <div><span className="text-white/40">distance: </span><span className="text-white/80">{raceData.race.distance}m</span></div>
              <div><span className="text-white/40">ground: </span><span className="text-white/80">{raceData.race.ground}</span></div>
            </div>
          </div>

          {/* Finish order comparison */}
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-3">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
              Step 3: Finish order
            </p>
            <div className="rounded-lg overflow-hidden border border-white/[0.05]">
              <div className="grid grid-cols-[40px_1fr_80px_80px] gap-2 px-3 py-2 bg-white/[0.03] text-[10px] text-white/40 uppercase tracking-wider font-bold">
                <span>Pos</span>
                <span>Horse</span>
                <span className="text-right">Server</span>
                <span className="text-right">You</span>
              </div>
              {result.computedFinish.map((c) => {
                const server = result.serverFinish.find(
                  (s) => s.horseId === c.horseId
                );
                const match = server?.finishPosition === c.finishPosition;
                return (
                  <div
                    key={c.horseId}
                    className={cn(
                      "grid grid-cols-[40px_1fr_80px_80px] gap-2 px-3 py-2 text-xs border-t border-white/[0.04]",
                      match ? "text-white/80" : "text-red bg-red/[0.04]"
                    )}
                  >
                    <span className="font-bold font-mono">#{c.finishPosition}</span>
                    <span className="truncate">{c.horseName}</span>
                    <span className="text-right font-mono">
                      {server?.finishPosition ?? "—"}
                    </span>
                    <span className="text-right font-mono">{c.finishPosition}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Explainer */}
      <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-3">
        <h2 className="text-sm font-black text-white">How it works</h2>
        <ol className="text-xs text-white/50 space-y-2 list-decimal list-inside">
          <li>
            Before each race we generate a random <span className="font-mono text-white/70">server_seed</span> and
            publish its SHA-256 hash — we're committing to the outcome before any bets are placed.
          </li>
          <li>
            When the race ends we reveal the actual seed. Anyone can SHA-256 it and confirm it
            matches the hash we committed to.
          </li>
          <li>
            The finish order is derived deterministically from{" "}
            <span className="font-mono text-white/70">HMAC_SHA256(server_seed, client_seed:nonce:…)</span>{" "}
            combined with published horse stats. Same inputs, same outputs — every time.
          </li>
          <li>
            This page re-runs the exact same math in your browser. If anything were rigged,
            your result wouldn't match ours.
          </li>
        </ol>
      </div>
    </div>
  );
}
