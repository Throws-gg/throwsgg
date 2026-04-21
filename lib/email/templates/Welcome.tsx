import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface WelcomeProps {
  username?: string;
  bonusAmount?: number; // USDC, e.g. 20
  wageringRequired?: number; // e.g. 60
  bonusExpiresAt?: string; // ISO
}

export default function Welcome({
  username = "degen",
  bonusAmount = 20,
  wageringRequired = 60,
  bonusExpiresAt,
}: WelcomeProps) {
  const expiresText = bonusExpiresAt
    ? new Date(bonusExpiresAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "14 days";
  return (
    <Layout preview={`Welcome to throws.gg — your $${bonusAmount} bonus is live`}>
      <Text style={headingStyle}>welcome to the track, {username}</Text>
      <Text style={textStyle}>
        you&apos;re in. throws.gg runs a virtual horse race every 3 minutes —
        480 a day, 16 horses with real form, provably fair every time.
      </Text>
      <Text style={textStyle}>
        your <strong>${bonusAmount} signup bonus</strong> is already in your
        account. wager ${wageringRequired} (3× the bonus) and it converts to
        cash you can withdraw. expires {expiresText}.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          open the next race →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        first time? deposit with USDC or SOL on Solana — no KYC under $2,000,
        withdrawals usually under 5 minutes.
      </Text>
    </Layout>
  );
}
