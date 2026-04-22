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
  username = "there",
  balance,
}: ReactivationD30Props) {
  return (
    <Layout preview="One last check-in">
      <Text style={headingStyle}>One last check-in, {username}</Text>
      <Text style={textStyle}>
        It&apos;s been a month since your last visit to throws.gg. This is
        the last time we&apos;ll reach out for a while. If you want to come
        back, the door&apos;s always open. If not, no hard feelings.
      </Text>
      {balance && balance > 0 ? (
        <Text style={textStyle}>
          Quick reminder: you still have{" "}
          <strong>{balance.toFixed(2)} USDC</strong> on your account. You can
          withdraw any time from the wallet page.
        </Text>
      ) : null}
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Visit throws.gg
        </Button>
      </Section>
      <Text style={mutedStyle}>
        To stop all non-transactional emails, tap the unsubscribe link in
        the footer.
      </Text>
    </Layout>
  );
}
