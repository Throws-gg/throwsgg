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
  username = "degen",
  rakebackAmount,
  tierName,
  tierPct,
}: RakebackReadyProps) {
  return (
    <Layout preview={`$${rakebackAmount.toFixed(2)} rakeback ready`}>
      <Text style={headingStyle}>
        ${rakebackAmount.toFixed(2)} rakeback, {username}
      </Text>
      <Text style={textStyle}>
        {tierName && tierPct
          ? `${tierName} tier — ${tierPct}% of every bet`
          : "a cut of your wagering"}
        {" "}just hit claimable. no wagering requirement, no expiry.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/wallet" style={buttonStyle}>
          claim rakeback →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        rakeback accrues continuously. the more you wager, the higher the
        tier.
      </Text>
    </Layout>
  );
}
