import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface WithdrawalSentProps {
  username?: string;
  amountUsd: number;
  destination: string; // solana address
  txSignature: string;
}

export default function WithdrawalSent({
  username = "degen",
  amountUsd,
  destination,
  txSignature,
}: WithdrawalSentProps) {
  const explorerUrl = `https://solscan.io/tx/${txSignature}`;
  return (
    <Layout
      preview={`Withdrawal sent — $${amountUsd.toFixed(2)} USDC on its way`}
    >
      <Text style={headingStyle}>${amountUsd.toFixed(2)} USDC on its way</Text>
      <Text style={textStyle}>
        hey {username}, your withdrawal is on-chain. usually lands within a
        minute once Solana confirms.
      </Text>
      <Section style={boxStyle}>
        <Text style={rowLabel}>destination</Text>
        <Text style={rowValue}>
          {destination.slice(0, 8)}…{destination.slice(-8)}
        </Text>
        <Text style={rowLabel}>amount</Text>
        <Text style={rowValue}>${amountUsd.toFixed(2)} USDC</Text>
        <Text style={rowLabel}>transaction</Text>
        <Text style={rowValue}>
          {txSignature.slice(0, 12)}…{txSignature.slice(-8)}
        </Text>
      </Section>
      <Section style={{ margin: "24px 0" }}>
        <Button href={explorerUrl} style={buttonStyle}>
          view on Solscan →
        </Button>
      </Section>
      <Text style={mutedStyle}>
        didn&apos;t request this? reply to this email immediately — we&apos;ll
        lock your account.
      </Text>
    </Layout>
  );
}

const boxStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  border: "1px solid #262626",
  borderRadius: 8,
  margin: "16px 0",
  padding: "16px 20px",
};

const rowLabel: React.CSSProperties = {
  color: "#737373",
  fontSize: 12,
  letterSpacing: "0.04em",
  margin: "8px 0 2px",
  textTransform: "uppercase",
};

const rowValue: React.CSSProperties = {
  color: "#fafafa",
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 14,
  margin: 0,
};
