import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface ReactivationD14Props {
  username?: string;
  balance?: number;
}

export default function ReactivationD14({
  username = "degen",
  balance,
}: ReactivationD14Props) {
  return (
    <Layout preview="Two weeks off the track">
      <Text style={headingStyle}>you good, {username}?</Text>
      <Text style={textStyle}>
        two weeks no bets. if throws.gg isn&apos;t working for you, we want
        to know why — hit reply with one line and we read it.
      </Text>
      {balance && balance > 0 ? (
        <Text style={textStyle}>
          heads up: <strong>${balance.toFixed(2)}</strong> is still on
          account. you can withdraw it any time, no KYC under $2,000.
        </Text>
      ) : null}
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          back to the track →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        taking a break is healthy. /responsible-gambling has self-exclusion
        tools if you need them.
      </Text>
    </Layout>
  );
}
