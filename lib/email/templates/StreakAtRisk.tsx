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
  username = "there",
  streakDays,
  hoursLeft,
}: StreakAtRiskProps) {
  return (
    <Layout
      preview={`${streakDays}-day streak — ${hoursLeft} hours left`}
    >
      <Text style={headingStyle}>
        Your {streakDays}-day streak is at risk
      </Text>
      <Text style={textStyle}>
        Hi {username}, you have about <strong>{hoursLeft} hours</strong> left
        to keep your <strong>{streakDays}-day streak</strong> alive. One bet
        before midnight UTC is enough.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Keep the streak alive
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Streak freezes activate automatically if you have any available — you
        can check your profile to see how many you&apos;ve earned.
      </Text>
    </Layout>
  );
}
