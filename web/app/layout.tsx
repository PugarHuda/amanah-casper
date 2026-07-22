import type { Metadata, Viewport } from "next";
import { Newsreader, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// The page supports both themes now, so we let the browser know (prevents auto-dark
// overlays fighting our own dark theme). The actual theme is set before paint below.
export const viewport: Viewport = { colorScheme: "light dark" };

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
  // Set the theme BEFORE the page paints so there's no flash of the wrong theme.
  const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){}})();`;
  return (
    <html lang="en" className={`${newsreader.variable} ${manrope.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
