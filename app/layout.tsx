import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// All routes are authentication-gated and data-driven — no benefit from
// static generation. This also prevents Firebase from initialising with
// missing env vars during `next build` prerendering.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FleetAdvisory · AI Logistics Intelligence Platform",
  description:
    "AI-powered logistics intelligence platform for monitoring corridor disruptions, political events, weather risks, strikes, traffic alerts, and operational advisories across India.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
