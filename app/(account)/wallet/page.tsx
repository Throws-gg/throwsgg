"use client";

import { useUserStore } from "@/stores/userStore";
import { Button } from "@/components/ui/button";

export default function WalletPage() {
  const balance = useUserStore((s) => s.balance);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">wallet</h1>
        <p className="text-sm text-muted-foreground">your money, ser</p>
      </div>

      {/* Balance card */}
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
          balance
        </p>
        <p className="text-4xl font-bold font-mono tabular-nums">
          ${balance.toFixed(2)}
        </p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          size="lg"
          className="bg-green hover:bg-green/80 text-white h-14"
        >
          deposit
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="border-border h-14"
        >
          withdraw
        </Button>
      </div>

      {/* Transaction history */}
      <div>
        <h2 className="text-sm font-medium mb-3">transactions</h2>
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground text-sm">no transactions yet</p>
        </div>
      </div>
    </div>
  );
}
