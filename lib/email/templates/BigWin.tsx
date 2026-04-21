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
  username = "degen",
  winAmount,
  horseName,
  oddsDecimal,
  raceNumber,
  shareUrl,
}: BigWinProps) {
  const shareText = encodeURIComponent(
    `just hit $${winAmount.toFixed(2)} on throws.gg 🏇 virtual horse racing, every 3 minutes`
  );
  const xShare = `https://x.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(
    shareUrl || "https://throws.gg"
  )}`;
  return (
    <Layout preview={`ABSOLUTE UNIT — $${winAmount.toFixed(2)} win`}>
      <Text style={headingStyle}>ABSOLUTE UNIT</Text>
      <Text style={textStyle}>
        {username}, you just took <strong>${winAmount.toFixed(2)}</strong> off
        the house
        {horseName ? (
          <>
            {" "}with <strong>{horseName}</strong>
          </>
        ) : null}
        {oddsDecimal ? (
          <>
            {" "}at <strong>{oddsDecimal.toFixed(2)}×</strong>
          </>
        ) : null}
        {raceNumber ? <> in race #{raceNumber}</> : null}. LFG.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={xShare} style={buttonStyle}>
          share on X →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        every race is provably fair. verify the seed on /verify.
      </Text>
    </Layout>
  );
}
