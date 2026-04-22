import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface FirstBetPlacedProps {
  username?: string;
  horseName?: string;
  amount?: number;
  oddsDecimal?: number;
}

export default function FirstBetPlaced({
  username = "there",
  horseName = "your pick",
  amount,
  oddsDecimal,
}: FirstBetPlacedProps) {
  return (
    <Layout preview="Your first bet is locked in">
      <Text style={headingStyle}>Your first bet is locked in</Text>
      <Text style={textStyle}>
        Nice one, {username}. You backed <strong>{horseName}</strong>
        {amount ? (
          <>
            {" "}for <strong>{amount.toFixed(2)} USDC</strong>
          </>
        ) : null}
        {oddsDecimal ? (
          <>
            {" "}at <strong>{oddsDecimal.toFixed(2)}x</strong> odds
          </>
        ) : null}
        .
      </Text>
      <Text style={textStyle}>
        The race outcome is already sealed — the server seed was committed
        before betting closed, and every race is verifiable from the{" "}
        <strong>/verify</strong> page after it settles.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Watch the race
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Reminder: wager 60 USDC total to unlock your signup bonus as
        withdrawable cash.
      </Text>
    </Layout>
  );
}
