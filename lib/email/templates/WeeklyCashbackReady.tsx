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
  username = "degen",
  cashbackAmount,
  weekEndingIso,
}: WeeklyCashbackReadyProps) {
  const weekEnding = new Date(weekEndingIso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <Layout preview={`$${cashbackAmount.toFixed(2)} cashback ready to claim`}>
      <Text style={headingStyle}>
        ${cashbackAmount.toFixed(2)} back, {username}
      </Text>
      <Text style={textStyle}>
        week ending {weekEnding} — your cashback is ready. tap in, claim,
        deploy it on the next race.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/wallet" style={buttonStyle}>
          claim cashback →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        unclaimed cashback rolls forward indefinitely. no expiry.
      </Text>
    </Layout>
  );
}
