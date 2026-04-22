import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface WeeklyCashbackReadyProps {
  username?: string;
  cashbackAmount: number;
  weekEndingIso: string;
}

export default function WeeklyCashbackReady({
  username = "there",
  cashbackAmount,
  weekEndingIso,
}: WeeklyCashbackReadyProps) {
  const weekEnding = new Date(weekEndingIso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <Layout preview={`Your weekly cashback is ready to claim`}>
      <Text style={headingStyle}>
        Your weekly cashback is ready
      </Text>
      <Text style={textStyle}>
        Hi {username}, for the week ending {weekEnding} you&apos;ve earned{" "}
        <strong>{cashbackAmount.toFixed(2)} USDC</strong> in cashback. Tap the
        button below and it&apos;ll drop straight into your balance.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/wallet" style={buttonStyle}>
          Claim cashback
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Cashback never expires. If you prefer to let it build up, unclaimed
        amounts roll forward to next week.
      </Text>
    </Layout>
  );
}
