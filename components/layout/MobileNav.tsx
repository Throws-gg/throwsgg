"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function RacingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function FormIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function LeaderboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C6 4 6 7 6 7" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C18 4 18 7 18 7" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function EventsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.39 4.84L20 8l-4 3.9.94 5.5L12 14.77 7.06 17.4 8 11.9 4 8l5.61-1.16L12 2z" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  Icon: ({ className }: { className?: string }) => React.JSX.Element;
  comingSoon?: boolean;
}

const navItems: NavItem[] = [
  { href: "/racing", label: "racing", Icon: RacingIcon },
  { href: "/horses", label: "form", Icon: FormIcon },
  { href: "/leaderboard", label: "leaders", Icon: LeaderboardIcon },
  { href: "#events", label: "events", Icon: EventsIcon, comingSoon: true },
  { href: "/profile", label: "profile", Icon: ProfileIcon },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md md:hidden safe-area-pb">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive = !item.comingSoon && pathname === item.href;
          const isGameTab = item.href === "/racing";

          if (item.comingSoon) {
            return (
              <div
                key={item.href}
                aria-disabled
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-semibold relative text-muted-foreground/40 cursor-not-allowed select-none"
              >
                <div className="relative">
                  <item.Icon className="w-5 h-5" />
                  <span className="absolute -top-1 -right-2 px-1 h-3 rounded-sm bg-muted-foreground/15 text-[7px] leading-3 font-mono uppercase tracking-wider text-muted-foreground/70 flex items-center">
                    soon
                  </span>
                </div>
                <span>{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-semibold transition-colors relative",
                isActive
                  ? "text-violet"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-[3px] bg-violet rounded-full shadow-[0_0_8px_rgba(139,92,246,0.4)]" />
              )}
              <div className="relative">
                <item.Icon className="w-5 h-5" />
                {/* Live betting indicator on game tabs */}
                {isGameTab && !isActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
