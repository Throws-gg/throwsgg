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
  username = "degen",
  totalWageredMonth,
  netProfitMonth,
}: RGMonthlyCheckinProps) {
  const inProfit = netProfitMonth >= 0;
  return (
    <Layout preview="Your monthly throws.gg check-in">
      <Text style={headingStyle}>monthly check-in, {username}</Text>
      <Text style={textStyle}>
        we think it&apos;s good practice to look at the numbers every month.
        last 30 days on throws.gg:
      </Text>
      <Section style={{ margin: "16px 0" }}>
        <Text style={textStyle}>
          total wagered: <strong>${totalWageredMonth.toFixed(2)}</strong>
        </Text>
        <Text style={textStyle}>
          net result:{" "}
          <strong style={{ color: inProfit ? "#22c55e" : "#ef4444" }}>
            {inProfit ? "+" : ""}${netProfitMonth.toFixed(2)}
          </strong>
        </Text>
      </Section>
      <Text style={textStyle}>
        deposit limits, session limits, and self-exclusion are all on the
        responsible gambling page. they apply instantly and you don&apos;t
        need to email us to use them.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button
          href="https://throws.gg/responsible-gambling"
          style={buttonStyle}
        >
          set a limit →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        if gambling is no longer fun, support is at begambleaware.org (UK),
        gamblinghelponline.org.au (AU), 1-800-GAMBLER (US).
      </Text>
    </Layout>
  );
}
