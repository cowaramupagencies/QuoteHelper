import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CowAg Quote Helper",
  description: "Internal quoting tool for Cowaramup Agencies",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="min-h-screen bg-page font-sans text-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
