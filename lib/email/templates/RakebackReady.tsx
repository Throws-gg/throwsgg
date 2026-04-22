import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface RakebackReadyProps {
  username?: string;
  rakebackAmount: number;
  tierName?: string;
  tierPct?: number;
}

export default function RakebackReady({
  username = "there",
  rakebackAmount,
  tierName,
  tierPct,
}: RakebackReadyProps) {
  return (
    <Layout preview="Your rakeback is ready to claim">
      <Text style={headingStyle}>
        Your rakeback is ready to claim
      </Text>
      <Text style={textStyle}>
        Hi {username}, you have{" "}
        <strong>{rakebackAmount.toFixed(2)} USDC</strong> in rakeback waiting
        for you.
        {tierName && tierPct ? (
          <>
            {" "}You&apos;re on the <strong>{tierName}</strong> tier, which
            pays <strong>{tierPct}%</strong> of the house edge back to you on
            every bet.
          </>
        ) : null}
      </Text>
      <Text style={textStyle}>
        There&apos;s no wagering requirement and no expiry — the amount sits
        in your account until you claim it.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/wallet" style={buttonStyle}>
          Claim rakeback
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Rakeback accrues continuously as you play. The more you wager, the
        higher your tier.
      </Text>
    </Layout>
  );
}
