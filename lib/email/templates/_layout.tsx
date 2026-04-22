import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface LayoutProps {
  preview: string;
  children: React.ReactNode;
}

/**
 * Shared email shell. Dark theme to match throws.gg brand.
 * Inline styles only — email clients ignore <style> and class names.
 */
export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>throws.gg</Text>
          </Section>
          <Section style={content}>{children}</Section>
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              throws.gg — virtual horse racing
            </Text>
            <Text style={footerText}>
              <Link href="https://throws.gg/settings" style={footerLink}>
                Email preferences
              </Link>
              {" · "}
              <Link
                href="https://throws.gg/responsible-gambling"
                style={footerLink}
              >
                Responsible gambling
              </Link>
              {" · "}
              <Link href="https://throws.gg/terms" style={footerLink}>
                Terms
              </Link>
            </Text>
            <Text style={footerFine}>
              18+ only. Please play responsibly. Virtual sports — outcomes are
              deterministic and provably fair.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#0a0a0a",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: 0,
  padding: "32px 0",
};

const container: React.CSSProperties = {
  backgroundColor: "#141414",
  border: "1px solid #262626",
  borderRadius: 12,
  margin: "0 auto",
  maxWidth: 560,
  padding: 0,
};

const header: React.CSSProperties = {
  padding: "24px 32px 0",
};

const logo: React.CSSProperties = {
  color: "#8B5CF6",
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  margin: 0,
};

const content: React.CSSProperties = {
  padding: "16px 32px 24px",
};

const hr: React.CSSProperties = {
  borderColor: "#262626",
  margin: "0 32px",
};

const footer: React.CSSProperties = {
  padding: "16px 32px 24px",
};

const footerText: React.CSSProperties = {
  color: "#737373",
  fontSize: 12,
  lineHeight: 1.6,
  margin: "4px 0",
};

const footerLink: React.CSSProperties = {
  color: "#a3a3a3",
  textDecoration: "underline",
};

const footerFine: React.CSSProperties = {
  color: "#525252",
  fontSize: 11,
  lineHeight: 1.5,
  marginTop: 12,
};

export const textStyle: React.CSSProperties = {
  color: "#e5e5e5",
  fontSize: 15,
  lineHeight: 1.6,
  margin: "12px 0",
};

export const headingStyle: React.CSSProperties = {
  color: "#fafafa",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  margin: "0 0 8px",
};

export const buttonStyle: React.CSSProperties = {
  backgroundColor: "#8B5CF6",
  borderRadius: 8,
  color: "#ffffff",
  display: "inline-block",
  fontSize: 15,
  fontWeight: 600,
  padding: "12px 24px",
  textDecoration: "none",
};

export const mutedStyle: React.CSSProperties = {
  color: "#a3a3a3",
  fontSize: 14,
  lineHeight: 1.6,
  margin: "8px 0",
};
