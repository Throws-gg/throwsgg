"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  User,
  Wallet,
  History,
  Users,
  LogOut,
  BookOpen,
} from "lucide-react";
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
  const bonusBalance = useUserStore((s) => s.bonusBalance);
  const userId = useUserStore((s) => s.userId);
  if (!userId) return null;

  const hasBonus = bonusBalance > 0;

  return (
    <Link
      href="/wallet"
      className="flex items-center gap-2 rounded-lg px-3 py-1.5
        bg-gradient-to-r from-violet/10 to-magenta/10
        border border-violet/25
        shadow-[0_0_12px_rgba(139,92,246,0.12)]
        hover:border-violet/40 transition-colors"
    >
      <span className="text-green font-mono font-black text-sm tabular-nums">
        ${balance.toFixed(2)}
      </span>
      {hasBonus && (
        <>
          <span className="w-px h-3 bg-white/10" />
          <span className="flex items-center gap-1">
            <span className="text-[8px] font-black uppercase text-gold/80 tracking-widest">
              Bonus
            </span>
            <span className="text-gold font-mono font-black text-xs tabular-nums">
              ${bonusBalance.toFixed(2)}
            </span>
          </span>
        </>
      )}
    </Link>
  );
}

function UserMenu() {
  const { userId, username, balance, totalWagered } = useUserStore();
  const { login, logout } = useAuthActions();
  const router = useRouter();

  if (!userId) {
    return (
      <Button
        size="sm"
        className="bg-violet text-white font-black text-xs px-3
          hover:bg-violet/90 active:scale-95
          animate-cta-glow"
        onClick={login}
      >
        START BETTING
      </Button>
    );
  }

  const initials = username?.slice(0, 2).toUpperCase() || "??";
  const displayName = username || "player";

  // VIP tier from totalWagered
  const tierColor = totalWagered >= 250_000 ? "#8B5CF6" : totalWagered >= 50_000 ? "#06B6D4" : totalWagered >= 10_000 ? "#F59E0B" : totalWagered >= 1_000 ? "#C0C0C0" : "#CD7F32";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="group/trigger relative flex items-center gap-2 rounded-full
          pl-1 pr-2.5 py-1
          bg-gradient-to-r from-violet/20 via-violet/10 to-magenta/15
          border border-violet/40
          shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_4px_20px_-4px_rgba(139,92,246,0.35)]
          outline-none
          transition-all duration-200
          hover:border-magenta/60
          hover:shadow-[0_0_0_1px_rgba(236,72,153,0.25),0_6px_28px_-4px_rgba(236,72,153,0.45)]
          hover:from-violet/30 hover:via-violet/20 hover:to-magenta/25
          active:scale-[0.97]
          data-[popup-open]:border-magenta/70
          data-[popup-open]:shadow-[0_0_0_1px_rgba(236,72,153,0.35),0_6px_28px_-4px_rgba(236,72,153,0.5)]"
      >
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full
            bg-green shadow-[0_0_8px_rgba(52,211,153,0.8)]
            ring-2 ring-background"
          aria-hidden
        />
        <Avatar className="h-7 w-7 ring-1" style={{ ["--tw-ring-color" as string]: `${tierColor}80` }}>
          <AvatarFallback
            className="text-white text-[10px] font-black tracking-wider"
            style={{ background: `linear-gradient(135deg, ${tierColor}40, ${tierColor}20)` }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className="hidden sm:inline text-[11px] font-black uppercase tracking-[0.08em]
            text-foreground/95 max-w-[90px] truncate"
        >
          {displayName}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 text-foreground/60
            transition-transform duration-200
            group-data-[popup-open]/trigger:rotate-180
            group-hover/trigger:text-magenta"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 overflow-hidden
          bg-popover/95 backdrop-blur-xl
          border border-violet/25
          shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8),0_0_0_1px_rgba(139,92,246,0.1)]"
      >
        {/* Account header card */}
        <div
          className="relative px-4 pt-4 pb-3
            bg-gradient-to-br from-violet/15 via-transparent to-magenta/10
            border-b border-border"
        >
          <div
            className="absolute inset-x-0 top-0 h-px
              bg-gradient-to-r from-transparent via-violet/60 to-transparent"
            aria-hidden
          />
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 ring-2 ring-violet/50
              shadow-[0_0_20px_rgba(139,92,246,0.35)]">
              <AvatarFallback
                className="bg-gradient-to-br from-violet to-magenta text-white
                  text-sm font-black tracking-wider"
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.12em]
                  text-muted-foreground"
              >
                Signed in as
              </div>
              <div
                className="text-sm font-black text-foreground truncate
                  tracking-tight"
              >
                {displayName}
              </div>
            </div>
          </div>

          {/* Stat strip */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div
              className="rounded-md px-2.5 py-1.5
                bg-background/60 border border-border"
            >
              <div
                className="text-[9px] font-bold uppercase tracking-[0.1em]
                  text-muted-foreground"
              >
                Balance
              </div>
              <div className="text-sm font-black font-mono tabular-nums text-green">
                ${balance.toFixed(2)}
              </div>
            </div>
            <div
              className="rounded-md px-2.5 py-1.5
                bg-background/60 border border-border"
            >
              <div
                className="text-[9px] font-bold uppercase tracking-[0.1em]
                  text-muted-foreground"
              >
                Wagered
              </div>
              <div className="text-sm font-black font-mono tabular-nums text-foreground/90">
                ${totalWagered.toFixed(0)}
              </div>
            </div>
          </div>
        </div>

        {/* Menu items */}
        <div className="p-1.5">
          <DropdownMenuItem
            className="group/item cursor-pointer rounded-md
              px-2.5 py-2 my-0.5
              text-[11px] font-black uppercase tracking-[0.08em]
              text-foreground/80
              focus:bg-violet/15 focus:text-foreground
              transition-colors"
            onClick={() => router.push("/profile")}
          >
            <User className="h-4 w-4 text-violet group-focus/item:text-magenta transition-colors" />
            <span className="ml-1">Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="group/item cursor-pointer rounded-md
              px-2.5 py-2 my-0.5
              text-[11px] font-black uppercase tracking-[0.08em]
              text-foreground/80
              focus:bg-violet/15 focus:text-foreground
              transition-colors"
            onClick={() => router.push("/wallet")}
          >
            <Wallet className="h-4 w-4 text-violet group-focus/item:text-magenta transition-colors" />
            <span className="ml-1">Wallet</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="group/item cursor-pointer rounded-md
              px-2.5 py-2 my-0.5
              text-[11px] font-black uppercase tracking-[0.08em]
              text-foreground/80
              focus:bg-violet/15 focus:text-foreground
              transition-colors"
            onClick={() => router.push("/horses")}
          >
            <BookOpen className="h-4 w-4 text-violet group-focus/item:text-magenta transition-colors" />
            <span className="ml-1">Form Guide</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="group/item cursor-pointer rounded-md
              px-2.5 py-2 my-0.5
              text-[11px] font-black uppercase tracking-[0.08em]
              text-foreground/80
              focus:bg-violet/15 focus:text-foreground
              transition-colors"
            onClick={() => router.push("/history")}
          >
            <History className="h-4 w-4 text-violet group-focus/item:text-magenta transition-colors" />
            <span className="ml-1">Bet History</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="group/item cursor-pointer rounded-md
              px-2.5 py-2 my-0.5
              text-[11px] font-black uppercase tracking-[0.08em]
              text-foreground/80
              focus:bg-violet/15 focus:text-foreground
              transition-colors"
            onClick={() => router.push("/referrals")}
          >
            <Users className="h-4 w-4 text-violet group-focus/item:text-magenta transition-colors" />
            <span className="ml-1">Referrals</span>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="my-0" />

        <div className="p-1.5">
          <DropdownMenuItem
            className="group/item cursor-pointer rounded-md
              px-2.5 py-2
              text-[11px] font-black uppercase tracking-[0.08em]
              text-red/90
              focus:bg-red/10 focus:text-red
              transition-colors"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 text-red/80 group-focus/item:text-red transition-colors" />
            <span className="ml-1">Log Out</span>
          </DropdownMenuItem>
        </div>
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
