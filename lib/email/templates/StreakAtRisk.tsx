import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface StreakAtRiskProps {
  username?: string;
  streakDays: number;
  hoursLeft: number;
}

export default function StreakAtRisk({
  username = "degen",
  streakDays,
  hoursLeft,
}: StreakAtRiskProps) {
  return (
    <Layout preview={`${streakDays}-day streak at risk — ${hoursLeft}h left`}>
      <Text style={headingStyle}>
        {streakDays}-day streak is on the line
      </Text>
      <Text style={textStyle}>
        {username}, you&apos;re <strong>{hoursLeft} hours</strong> from losing
        a <strong>{streakDays}-day</strong> streak. one bet before midnight
        (UTC) keeps it alive.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          save the streak →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        streak freezes activate automatically if you use one — check your
        profile.
      </Text>
    </Layout>
  );
}
