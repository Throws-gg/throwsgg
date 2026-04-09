"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/userStore";
import { useAuthActions } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Image
        src="/logo-horse.png"
        alt="throws.gg"
        width={120}
        height={32}
        className="h-7 w-auto"
        priority
      />
    </Link>
  );
}

function BalanceDisplay() {
  const balance = useUserStore((s) => s.balance);
  const userId = useUserStore((s) => s.userId);
  if (!userId) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5
      bg-gradient-to-r from-violet/10 to-magenta/10
      border border-violet/25
      shadow-[0_0_12px_rgba(139,92,246,0.12)]">
      <span className="text-green font-mono font-black text-sm tabular-nums">
        ${balance.toFixed(2)}
      </span>
    </div>
  );
}

function UserMenu() {
  const { userId, username } = useUserStore();
  const { login, logout } = useAuthActions();
  const router = useRouter();

  if (!userId) {
    return (
      <Button
        size="sm"
        className="bg-violet hover:bg-violet/80 text-white"
        onClick={login}
      >
        play now
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-violet/20 text-violet text-xs">
            {username?.slice(0, 2).toUpperCase() || "??"}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => router.push("/profile")}
        >
          profile
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => router.push("/wallet")}
        >
          wallet
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => router.push("/history")}
        >
          bet history
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-red"
          onClick={logout}
        >
          logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const userId = useUserStore((s) => s.userId);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4 max-w-screen-2xl mx-auto">
        <Logo />
        <div className="flex items-center gap-3">
          <BalanceDisplay />
          {userId && (
            <Link href="/wallet">
              <Button
                size="sm"
                className="bg-green text-black font-black text-xs px-3
                  hover:bg-green/90 active:scale-95
                  animate-deposit-glow"
              >
                + DEPOSIT
              </Button>
            </Link>
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
