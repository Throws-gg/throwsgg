import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface ReactivationD30Props {
  username?: string;
  balance?: number;
}

export default function ReactivationD30({
  username = "degen",
  balance,
}: ReactivationD30Props) {
  return (
    <Layout preview="One month on — still here if you come back">
      <Text style={headingStyle}>a month, {username}</Text>
      <Text style={textStyle}>
        this is the last we&apos;ll check in for a while. if you want back on
        the track, the door&apos;s open. if not, no hard feelings.
      </Text>
      {balance && balance > 0 ? (
        <Text style={textStyle}>
          you still have <strong>${balance.toFixed(2)}</strong> on account.
          withdraw anytime from /wallet.
        </Text>
      ) : null}
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          back to throws.gg →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        to stop all emails, hit preferences in the footer.
      </Text>
    </Layout>
  );
}
