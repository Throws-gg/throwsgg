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
  username = "degen",
  amountUsd,
  token,
  newBalance,
  txSignature,
}: DepositReceivedProps) {
  return (
    <Layout preview={`Deposit received — $${amountUsd.toFixed(2)} credited`}>
      <Text style={headingStyle}>
        ${amountUsd.toFixed(2)} landed, {username}
      </Text>
      <Text style={textStyle}>
        your {token} deposit cleared. new balance: <strong>${newBalance.toFixed(2)}</strong>.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href="https://throws.gg/racing" style={buttonStyle}>
          place a bet →
        </Button>
      </Section>
      {txSignature && (
        <Text style={mutedStyle}>
          tx: <code style={code}>{txSignature.slice(0, 12)}…{txSignature.slice(-8)}</code>
        </Text>
      )}
      <Text style={mutedStyle}>
        didn&apos;t make this deposit? reply to this email immediately.
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
