"use client";

export default function AdminDashboardPage() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">admin dashboard</h1>
        <p className="text-sm text-muted-foreground">the control room</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "online users", value: "—" },
          { label: "today's volume", value: "$0.00" },
          { label: "today's GGR", value: "$0.00" },
          { label: "house edge", value: "—%" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-card border border-border rounded-lg p-4"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {stat.label}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums mt-1">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-muted-foreground text-sm">
          admin panels will be built in phase 7
        </p>
      </div>
    </div>
  );
}
