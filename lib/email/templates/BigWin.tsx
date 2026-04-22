import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface BigWinProps {
  username?: string;
  winAmount: number;
  horseName?: string;
  oddsDecimal?: number;
  raceNumber?: number;
  shareUrl?: string;
}

export default function BigWin({
  username = "there",
  winAmount,
  horseName,
  oddsDecimal,
  raceNumber,
  shareUrl,
}: BigWinProps) {
  const shareText = encodeURIComponent(
    `Just won ${winAmount.toFixed(2)} USDC on throws.gg — virtual horse racing, a new race every three minutes.`
  );
  const xShare = `https://x.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(
    shareUrl || "https://throws.gg"
  )}`;
  return (
    <Layout preview={`Nice win — ${winAmount.toFixed(2)} USDC`}>
      <Text style={headingStyle}>Nice win, {username}</Text>
      <Text style={textStyle}>
        You just won <strong>{winAmount.toFixed(2)} USDC</strong>
        {horseName ? (
          <>
            {" "}with <strong>{horseName}</strong>
          </>
        ) : null}
        {oddsDecimal ? (
          <>
            {" "}at <strong>{oddsDecimal.toFixed(2)}x</strong>
          </>
        ) : null}
        {raceNumber ? <> in race #{raceNumber}</> : null}. Your balance has
        already been credited.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={xShare} style={buttonStyle}>
          Share on X
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Every race is provably fair — you can verify the seed and outcome on
        the /verify page.
      </Text>
    </Layout>
  );
}
