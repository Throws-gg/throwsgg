"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function VerifyPage() {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">provably fair</h1>
        <p className="text-sm text-muted-foreground">
          here's how we prove we didn't rig it
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            server seed
          </label>
          <Input placeholder="revealed after round settles" />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            server seed hash
          </label>
          <Input placeholder="shown during betting phase" />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            client seed
          </label>
          <Input placeholder="throws.gg" />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            nonce
          </label>
          <Input type="number" placeholder="round number" />
        </div>
        <Button className="w-full bg-violet hover:bg-violet/80 text-white">
          verify
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-3">
        <h2 className="font-semibold">how it works</h2>
        <p className="text-sm text-muted-foreground">
          before each round, we generate a server seed and show you its SHA-256 hash.
          after the round, we reveal the actual seed. you can verify the hash matches
          and that the outcome was determined by HMAC_SHA256(serverSeed, clientSeed:nonce).
          no rug, just math.
        </p>
      </div>
    </div>
  );
}
