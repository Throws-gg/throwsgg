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
    <Layout preview={`You earned $${rakebackAmount.toFixed(2)} in rakeback this week`}>
      <Text style={headingStyle}>
        ${rakebackAmount.toFixed(2)} earned this week
      </Text>
      <Text style={textStyle}>
        Hi {username}, you earned{" "}
        <strong>${rakebackAmount.toFixed(2)} USDC</strong> in rakeback over the
        last seven days — already credited to your balance, every settled bet,
        no claim button to push.
        {tierName && tierPct ? (
          <>
            {" "}You&apos;re on the <strong>{tierName}</strong> tier, which
            pays back <strong>{tierPct}%</strong> of the house edge on every
            wager.
          </>
        ) : null}
      </Text>
      <Text style={textStyle}>
        No wagering requirement. No expiry. The more you bet, the higher your
        tier — and the higher your rakeback rate.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Back to the races
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Rakeback is paid on the cash portion of every settled bet, instantly.
      </Text>
    </Layout>
  );
}
