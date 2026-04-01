"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">settings</h1>
        <p className="text-sm text-muted-foreground">manage your account</p>
      </div>

      {/* Sound */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">sound</h2>
        <p className="text-xs text-muted-foreground">
          volume and sound preferences coming soon
        </p>
      </div>

      {/* Deposit limits */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">deposit limits</h2>
        <p className="text-xs text-muted-foreground">
          set daily, weekly, or monthly deposit caps
        </p>
      </div>

      <Separator />

      {/* Self-exclusion */}
      <div className="bg-card border border-destructive/30 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium text-destructive">self-exclusion</h2>
        <p className="text-xs text-muted-foreground">
          take a break. lock your account for a set period.
        </p>
        <div className="flex gap-2">
          {["24h", "7d", "30d", "permanent"].map((period) => (
            <Button
              key={period}
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
            >
              {period}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
