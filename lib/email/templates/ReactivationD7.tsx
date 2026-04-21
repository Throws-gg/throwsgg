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
  username = "degen",
  balance,
}: ReactivationD7Props) {
  return (
    <Layout preview="The horses have been asking about you">
      <Text style={headingStyle}>it&apos;s been a week, {username}</Text>
      <Text style={textStyle}>
        {balance && balance > 0 ? (
          <>
            you&apos;ve still got <strong>${balance.toFixed(2)}</strong> on
            account. that&apos;s real money sitting on the rail — put it to
            work.
          </>
        ) : (
          <>
            the track ran ~3,360 races since you last showed up. horses hit
            form, lost form, smashed form. come look at the form guide.
          </>
        )}
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          next race →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        not feeling it? you can mute these from /settings.
      </Text>
    </Layout>
  );
}
