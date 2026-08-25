import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenTrue Code",
  description: "A self-hosted, chat-first AI coding workspace with IDE, GitHub, deployment, and open-weight models.",
  openGraph: { title: "OpenTrue Code", description: "Chat. Code. Ship. Unlimited.", type: "website" },
  twitter: { card: "summary", title: "OpenTrue Code", description: "A self-hosted AI coding workspace." },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Script src="/cloud-sync.js" strategy="afterInteractive" /></body></html>;
}
