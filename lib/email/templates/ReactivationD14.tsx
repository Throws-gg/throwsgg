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
  username = "there",
  balance,
}: ReactivationD14Props) {
  return (
    <Layout preview="Checking in after two weeks">
      <Text style={headingStyle}>Checking in, {username}</Text>
      <Text style={textStyle}>
        It&apos;s been two weeks since your last bet. If throws.gg
        isn&apos;t working for you, I&apos;d genuinely like to know why —
        hit reply and tell me. I read every email personally.
      </Text>
      {balance && balance > 0 ? (
        <Text style={textStyle}>
          Also worth mentioning: you still have{" "}
          <strong>{balance.toFixed(2)} USDC</strong> on your account. You can
          withdraw any time. No KYC is required under 2,000 USDC.
        </Text>
      ) : null}
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Come back to throws.gg
        </Button>
      </Section>
      <Text style={mutedStyle}>
        If you&apos;re taking a deliberate break, that&apos;s a good thing.
        Self-exclusion tools are at /responsible-gambling if you&apos;d
        like a harder stop.
      </Text>
    </Layout>
  );
}
