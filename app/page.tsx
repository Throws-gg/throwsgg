import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
      <div className="max-w-2xl text-center space-y-8">
        {/* Hero */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <Image
              src="/characters/bull.png"
              alt="Bull"
              width={80}
              height={80}
              className="w-16 h-16 sm:w-20 sm:h-20"
            />
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight">
              <span className="text-violet">rock</span>{" "}
              <span className="text-magenta">paper</span>{" "}
              <span className="text-cyan">scissors</span>
            </h1>
            <Image
              src="/characters/bear.png"
              alt="Bear"
              width={80}
              height={80}
              className="w-16 h-16 sm:w-20 sm:h-20"
            />
          </div>
          <p className="text-xl text-muted-foreground">
            bull vs bear. they throw. you bet.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/arena">
            <Button
              size="lg"
              className="bg-violet hover:bg-violet/80 text-white text-lg px-8 py-6"
            >
              play now, degen
            </Button>
          </Link>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-3 gap-6 pt-8">
          <div className="space-y-2">
            <div className="text-3xl">👀</div>
            <p className="text-sm font-medium">watch</p>
            <p className="text-xs text-muted-foreground">
              bull vs bear, every 60 seconds
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-3xl">🎯</div>
            <p className="text-sm font-medium">bet</p>
            <p className="text-xs text-muted-foreground">
              pick a move or pick a player. up to 2.91x
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-3xl">💰</div>
            <p className="text-sm font-medium">profit</p>
            <p className="text-xs text-muted-foreground">
              provably fair. instant payouts.
            </p>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground pt-8">
          powered by vibes and cryptography
        </p>
      </div>
    </div>
  );
}
