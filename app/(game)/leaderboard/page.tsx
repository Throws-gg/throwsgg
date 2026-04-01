"use client";

export default function LeaderboardPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">leaderboard</h1>
        <p className="text-sm text-muted-foreground">the biggest degens</p>
      </div>

      {/* Tab filters */}
      <div className="flex gap-2">
        {["today", "this week", "this month", "all time"].map((tab) => (
          <button
            key={tab}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors first:bg-violet/20 first:text-violet"
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-muted-foreground text-sm">
          leaderboard populates after launch
        </p>
      </div>
    </div>
  );
}
