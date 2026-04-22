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
  bonusAmount?: number;
  wageringRequired?: number;
  bonusExpiresAt?: string;
}

export default function Welcome({
  username = "there",
  bonusAmount = 20,
  wageringRequired = 60,
  bonusExpiresAt,
}: WelcomeProps) {
  const expiresText = bonusExpiresAt
    ? new Date(bonusExpiresAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "in 14 days";
  return (
    <Layout preview="Your throws.gg account is ready">
      <Text style={headingStyle}>Welcome to throws.gg, {username}</Text>
      <Text style={textStyle}>
        Thanks for signing up. throws.gg runs a virtual horse race every three
        minutes — 480 races a day, 16 horses with real form data, and every
        outcome is provably fair.
      </Text>
      <Text style={textStyle}>
        We&apos;ve added a {bonusAmount} USDC welcome bonus to your account.
        Wager {wageringRequired} USDC (three times the bonus) and it converts
        to withdrawable cash. The bonus expires {expiresText}.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Open the next race
        </Button>
      </Section>
      <Text style={mutedStyle}>
        First time? You can deposit with USDC or SOL on Solana. No KYC under
        2,000 USDC, and withdrawals usually land in under five minutes.
      </Text>
      <Text style={mutedStyle}>
        Questions? Just reply to this email and we&apos;ll get back to you.
      </Text>
    </Layout>
  );
}
