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
  expiresAt: string; // ISO
}

export default function BonusExpiring({
  username = "degen",
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
    <Layout preview={`$${bonusBalance.toFixed(2)} bonus expires in ${hoursLeft}h`}>
      <Text style={headingStyle}>
        ${bonusBalance.toFixed(2)} on the clock, {username}
      </Text>
      <Text style={textStyle}>
        your signup bonus expires in roughly <strong>{hoursLeft} hours</strong>.
        finish <strong>${wageringRemaining.toFixed(2)}</strong> of wagering
        and it converts to withdrawable cash in one shot.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          clear the wager →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        any bet counts toward the requirement. lowest odds, highest odds,
        doesn&apos;t matter.
      </Text>
    </Layout>
  );
}
