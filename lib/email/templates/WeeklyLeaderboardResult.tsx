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
  username = "there",
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
          ? `You finished #${rank} this week — ${prizeAmount!.toFixed(2)} USDC prize`
          : `Your leaderboard result for the week of ${weekEnding}`
      }
    >
      <Text style={headingStyle}>
        {placed
          ? `Nice finish, ${username}`
          : `This week's leaderboard is in`}
      </Text>
      <Text style={textStyle}>
        For the week ending {weekEnding}, you finished{" "}
        <strong>#{rank}</strong> out of {totalEntrants.toLocaleString()}{" "}
        entrants.
        {placed ? (
          <>
            {" "}Your prize of{" "}
            <strong>{prizeAmount!.toFixed(2)} USDC</strong> has already been
            credited to your balance.
          </>
        ) : (
          <>
            {" "}The next leaderboard period is already running — you can
            jump back in any time.
          </>
        )}
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/leaderboard" style={buttonStyle}>
          View the leaderboard
        </Button>
      </Section>
      <Text style={mutedStyle}>
        The prize pool is a percentage of the prior week&apos;s gross gaming
        revenue — bigger weeks mean bigger pools.
      </Text>
    </Layout>
  );
}
