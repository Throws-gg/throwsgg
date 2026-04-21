import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface WeeklyLeaderboardResultProps {
  username?: string;
  rank: number;
  totalEntrants: number;
  prizeAmount?: number;
  weekEndingIso: string;
}

export default function WeeklyLeaderboardResult({
  username = "degen",
  rank,
  totalEntrants,
  prizeAmount,
  weekEndingIso,
}: WeeklyLeaderboardResultProps) {
  const weekEnding = new Date(weekEndingIso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const placed = prizeAmount && prizeAmount > 0;
  return (
    <Layout
      preview={
        placed
          ? `#${rank} this week — $${prizeAmount!.toFixed(2)} prize`
          : `Week of ${weekEnding} leaderboard result`
      }
    >
      <Text style={headingStyle}>
        {placed ? `#${rank} finish, ${username}` : `this week on throws.gg`}
      </Text>
      <Text style={textStyle}>
        week ending {weekEnding}: you finished{" "}
        <strong>#{rank}</strong> of {totalEntrants.toLocaleString()} entrants.
        {placed ? (
          <>
            {" "}prize: <strong>${prizeAmount!.toFixed(2)}</strong>, already
            in your balance.
          </>
        ) : (
          <> the next leaderboard resets now — get back in.</>
        )}
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/leaderboard" style={buttonStyle}>
          view leaderboard →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        prize pool is a % of the prior week&apos;s GGR. bigger weeks → bigger
        pools.
      </Text>
    </Layout>
  );
}
