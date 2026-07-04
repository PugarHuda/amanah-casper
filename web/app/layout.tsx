import type { Metadata } from "next";
import { Newsreader, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const SITE = "https://amanah-casper-rwa.vercel.app";
const DESC =
  "Autonomous, compliant RWA treasury agent on Casper: every AI decision is signed and verified on-chain by the contract itself — proof, not a diary. Two-agent auditor, zero-knowledge KYC, principal locked.";
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Amanah — A verifiable guardian for every asset",
  description: DESC,
  openGraph: {
    title: "Amanah — Autonomous Compliant RWA Treasury Agent",
    description: DESC,
    url: SITE,
    siteName: "Amanah",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Amanah — Verifiable RWA Treasury Agent", description: DESC },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${newsreader.variable} ${manrope.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
