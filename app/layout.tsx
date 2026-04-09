import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Providers } from "@/components/layout/Providers";
import { Navbar } from "@/components/layout/Navbar";
import { MobileNav } from "@/components/layout/MobileNav";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Throws.gg — virtual horse racing, real payouts",
  description:
    "16 AI horses. Fixed odds. Races every 3 minutes. Provably fair, crypto-native. They race. You bet. You profit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} dark`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground antialiased">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
