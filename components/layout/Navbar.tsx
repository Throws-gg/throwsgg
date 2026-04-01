"use client";

import Link from "next/link";
import Image from "next/image";
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
        src="/logo.png"
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
    <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5">
      <span className="text-muted-foreground text-sm">$</span>
      <span className="font-mono font-semibold text-sm tabular-nums">
        {balance.toFixed(2)}
      </span>
    </div>
  );
}

function UserMenu() {
  const { userId, username } = useUserStore();
  const { login, logout } = useAuthActions();

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
          onClick={() => (window.location.href = "/profile")}
        >
          profile
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => (window.location.href = "/wallet")}
        >
          wallet
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => (window.location.href = "/history")}
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
                variant="outline"
                className="border-green text-green hover:bg-green/10 text-xs"
              >
                + deposit
              </Button>
            </Link>
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
