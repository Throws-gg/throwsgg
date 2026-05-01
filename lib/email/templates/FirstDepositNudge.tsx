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
  username = "there",
}: FirstDepositNudgeProps) {
  return (
    <Layout preview="Ready when you are">
      <Text style={headingStyle}>Ready whenever you are, {username}</Text>
      <Text style={textStyle}>
        You signed up but haven&apos;t made a deposit yet. Whenever you&apos;re
        ready, you can deposit USDC on Solana. Minimum is 1 USDC, no KYC
        under 2,000 USDC, and credit lands after the funds are swept into custody.
      </Text>
      <Text style={textStyle}>
        The next race is always less than three minutes away. Pick a horse,
        lock in the odds, and watch the race play out.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/wallet" style={buttonStyle}>
          Go to your wallet
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Not ready? Just reply and let us know what&apos;s holding you back —
        we read every email.
      </Text>
    </Layout>
  );
}
