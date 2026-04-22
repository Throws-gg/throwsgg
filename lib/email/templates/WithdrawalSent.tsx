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
  destination: string;
  txSignature: string;
}

export default function WithdrawalSent({
  username = "there",
  amountUsd,
  destination,
  txSignature,
}: WithdrawalSentProps) {
  const explorerUrl = `https://solscan.io/tx/${txSignature}`;
  return (
    <Layout
      preview={`Withdrawal sent — ${amountUsd.toFixed(2)} USDC on its way`}
    >
      <Text style={headingStyle}>
        Your withdrawal is on its way
      </Text>
      <Text style={textStyle}>
        Hi {username}, your withdrawal of{" "}
        <strong>{amountUsd.toFixed(2)} USDC</strong> has been broadcast to
        Solana. It usually lands within a minute once the network confirms.
      </Text>
      <Section style={boxStyle}>
        <Text style={rowLabel}>Destination</Text>
        <Text style={rowValue}>
          {destination.slice(0, 8)}…{destination.slice(-8)}
        </Text>
        <Text style={rowLabel}>Amount</Text>
        <Text style={rowValue}>{amountUsd.toFixed(2)} USDC</Text>
        <Text style={rowLabel}>Transaction</Text>
        <Text style={rowValue}>
          {txSignature.slice(0, 12)}…{txSignature.slice(-8)}
        </Text>
      </Section>
      <Section style={{ margin: "24px 0" }}>
        <Button href={explorerUrl} style={buttonStyle}>
          View on Solscan
        </Button>
      </Section>
      <Text style={mutedStyle}>
        If you didn&apos;t request this withdrawal, reply immediately and
        we&apos;ll lock the account.
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
