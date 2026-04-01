"use client";

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">
            <span className="text-violet">Throws</span>
            <span className="text-muted-foreground">.gg</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            gm degen. ready to throw?
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">
            privy login flow will go here
          </p>
        </div>
      </div>
    </div>
  );
}
