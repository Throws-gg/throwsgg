import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface RGMonthlyCheckinProps {
  username?: string;
  totalWageredMonth: number;
  netProfitMonth: number;
}

export default function RGMonthlyCheckin({
  username = "there",
  totalWageredMonth,
  netProfitMonth,
}: RGMonthlyCheckinProps) {
  const inProfit = netProfitMonth >= 0;
  return (
    <Layout preview="Your monthly throws.gg summary">
      <Text style={headingStyle}>
        Your monthly summary, {username}
      </Text>
      <Text style={textStyle}>
        We think it&apos;s good practice to look at the numbers once a month.
        Here&apos;s your last 30 days on throws.gg:
      </Text>
      <Section style={{ margin: "16px 0" }}>
        <Text style={textStyle}>
          Total wagered:{" "}
          <strong>{totalWageredMonth.toFixed(2)} USDC</strong>
        </Text>
        <Text style={textStyle}>
          Net result:{" "}
          <strong style={{ color: inProfit ? "#22c55e" : "#ef4444" }}>
            {inProfit ? "+" : ""}
            {netProfitMonth.toFixed(2)} USDC
          </strong>
        </Text>
      </Section>
      <Text style={textStyle}>
        Deposit limits, session limits, and self-exclusion tools are all
        available on the responsible gambling page. They apply instantly and
        you don&apos;t need to email support to use them.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button
          href="https://throws.gg/responsible-gambling"
          style={buttonStyle}
        >
          Set a limit
        </Button>
      </Section>
      <Text style={mutedStyle}>
        If gambling has stopped being fun, help is available at
        begambleaware.org (UK), gamblinghelponline.org.au (AU), and
        1-800-GAMBLER (US).
      </Text>
    </Layout>
  );
}
