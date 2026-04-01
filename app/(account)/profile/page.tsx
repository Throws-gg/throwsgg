"use client";

import { useUserStore } from "@/stores/userStore";

export default function ProfilePage() {
  const { username, totalWagered, totalProfit } = useUserStore();

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{username ?? "anon"}</h1>
        <p className="text-sm text-muted-foreground">your stats</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            total wagered
          </p>
          <p className="text-xl font-bold font-mono tabular-nums">
            ${totalWagered.toFixed(2)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            total profit
          </p>
          <p
            className={`text-xl font-bold font-mono tabular-nums ${totalProfit >= 0 ? "text-green" : "text-red"}`}
          >
            {totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
