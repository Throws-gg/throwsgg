import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface BonusExpiringProps {
  username?: string;
  bonusBalance: number;
  wageringRemaining: number;
  expiresAt: string;
}

export default function BonusExpiring({
  username = "there",
  bonusBalance,
  wageringRemaining,
  expiresAt,
}: BonusExpiringProps) {
  const expiresDate = new Date(expiresAt);
  const hoursLeft = Math.max(
    0,
    Math.floor((expiresDate.getTime() - Date.now()) / (60 * 60 * 1000))
  );
  return (
    <Layout
      preview={`Your ${bonusBalance.toFixed(2)} USDC bonus expires in ${hoursLeft} hours`}
    >
      <Text style={headingStyle}>
        Your bonus expires in {hoursLeft} hours
      </Text>
      <Text style={textStyle}>
        Hi {username}, just a heads up: your{" "}
        <strong>{bonusBalance.toFixed(2)} USDC</strong> signup bonus expires
        soon.
      </Text>
      <Text style={textStyle}>
        You need to wager another{" "}
        <strong>{wageringRemaining.toFixed(2)} USDC</strong> to unlock it as
        withdrawable cash. Any bet counts toward the requirement — no minimum
        odds.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Clear the wagering
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Once the requirement is met, the full bonus balance converts to cash
        in a single step. If you don&apos;t clear it in time, the bonus is
        forfeited but any winnings you&apos;ve already locked in stay yours.
      </Text>
    </Layout>
  );
}
