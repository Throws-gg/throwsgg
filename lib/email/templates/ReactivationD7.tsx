import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface ReactivationD7Props {
  username?: string;
  balance?: number;
}

export default function ReactivationD7({
  username = "there",
  balance,
}: ReactivationD7Props) {
  return (
    <Layout preview="It's been a week — we've missed you">
      <Text style={headingStyle}>It&apos;s been a week, {username}</Text>
      <Text style={textStyle}>
        {balance && balance > 0 ? (
          <>
            You still have <strong>{balance.toFixed(2)} USDC</strong> on your
            throws.gg account. Whenever you want to jump back in, the next
            race is only a few minutes away.
          </>
        ) : (
          <>
            Since your last visit we&apos;ve run about 3,360 races. Horses
            have hit form, lost form, and the leaderboard has reshuffled. If
            you want to come back, everything&apos;s still here.
          </>
        )}
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Open the next race
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Not feeling it? You can mute reactivation emails from your settings.
      </Text>
    </Layout>
  );
}
