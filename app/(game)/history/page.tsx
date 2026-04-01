"use client";

export default function HistoryPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">bet history</h1>
        <p className="text-sm text-muted-foreground">your degen track record</p>
      </div>
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-muted-foreground text-sm">no bets yet. hit the arena.</p>
      </div>
    </div>
  );
}
