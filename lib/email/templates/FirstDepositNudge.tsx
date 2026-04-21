import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface FirstDepositNudgeProps {
  username?: string;
}

export default function FirstDepositNudge({
  username = "degen",
}: FirstDepositNudgeProps) {
  return (
    <Layout preview="Your first deposit unlocks the full track">
      <Text style={headingStyle}>still on the rail, {username}?</Text>
      <Text style={textStyle}>
        you&apos;re signed up but haven&apos;t made a deposit yet. USDC or SOL
        on Solana — minimum $1, no KYC under $2,000, usually in your account
        in under a minute.
      </Text>
      <Text style={textStyle}>
        the next race is always less than 3 minutes away. pick a horse, lock
        the odds, watch it play out.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/wallet" style={buttonStyle}>
          deposit now →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        not ready? reply and tell us what&apos;s blocking you — we read every
        one.
      </Text>
    </Layout>
  );
}
