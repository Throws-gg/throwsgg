import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  Layout,
  buttonStyle,
  headingStyle,
  mutedStyle,
  textStyle,
} from "./_layout";

interface DepositReceivedProps {
  username?: string;
  amountUsd: number;
  token: "USDC" | "SOL";
  newBalance: number;
  txSignature?: string;
}

export default function DepositReceived({
  username = "there",
  amountUsd,
  token,
  newBalance,
  txSignature,
}: DepositReceivedProps) {
  return (
    <Layout preview={`Deposit received — ${amountUsd.toFixed(2)} USDC credited`}>
      <Text style={headingStyle}>
        Your deposit has been credited
      </Text>
      <Text style={textStyle}>
        Hi {username}, we received your {token} deposit of{" "}
        <strong>{amountUsd.toFixed(2)} USDC</strong>. Your new balance is{" "}
        <strong>{newBalance.toFixed(2)} USDC</strong>.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          Place a bet
        </Button>
      </Section>
      {txSignature && (
        <Text style={mutedStyle}>
          Transaction:{" "}
          <code style={code}>
            {txSignature.slice(0, 12)}…{txSignature.slice(-8)}
          </code>
        </Text>
      )}
      <Text style={mutedStyle}>
        If you didn&apos;t make this deposit, please reply to this email right
        away.
      </Text>
    </Layout>
  );
}

const code: React.CSSProperties = {
  backgroundColor: "#1f1f1f",
  border: "1px solid #2a2a2a",
  borderRadius: 4,
  color: "#a3a3a3",
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 12,
  padding: "2px 6px",
};
