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
  username = "degen",
  horseName = "your pick",
  amount,
  oddsDecimal,
}: FirstBetPlacedProps) {
  return (
    <Layout preview="First bet locked in — welcome to the races">
      <Text style={headingStyle}>first bet&apos;s on the board, {username}</Text>
      <Text style={textStyle}>
        you backed <strong>{horseName}</strong>
        {amount ? (
          <>
            {" "}for <strong>${amount.toFixed(2)}</strong>
          </>
        ) : null}
        {oddsDecimal ? (
          <>
            {" "}at <strong>{oddsDecimal.toFixed(2)}×</strong>
          </>
        ) : null}
        . outcome is already sealed — the server seed was committed before
        betting closed. every race is verifiable on /verify.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          watch the race →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        wager $60 total and your signup bonus unlocks to cash.
      </Text>
    </Layout>
  );
}
