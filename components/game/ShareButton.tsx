"use client";

import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  winAmount: number;
  betType: string;
  roundNumber: number;
  className?: string;
}

export function ShareButton({
  winAmount,
  betType,
  roundNumber,
  className,
}: ShareButtonProps) {
  const shareText = getShareText(winAmount, betType, roundNumber);

  const handleShare = () => {
    const url = `https://throws.gg/verify?round=${roundNumber}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, "_blank", "noopener,noreferrer,width=550,height=420");
  };

  return (
    <Button
      onClick={handleShare}
      variant="outline"
      size="sm"
      className={`border-cyan text-cyan hover:bg-cyan/10 gap-1.5 ${className}`}
    >
      <XIcon />
      share win
    </Button>
  );
}

function getShareText(amount: number, betType: string, roundNumber: number): string {
  const formattedAmount = amount.toFixed(2);

  const lines = [
    `just hit $${formattedAmount} on @throwsgg betting ${betType} in Round #${roundNumber}`,
    `$${formattedAmount} off ${betType} on @throwsgg. rock paper scissors but make it degenerate.`,
    `+$${formattedAmount} on @throwsgg. ${betType} cooked. provably fair, fully verifiable.`,
    `$${formattedAmount} from betting on computers playing Rock Paper Scissors. @throwsgg is unhinged.`,
  ];

  return lines[Math.floor(Math.random() * lines.length)];
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
