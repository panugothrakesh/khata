import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Khata — a tamper-evident ledger for trading calls",
  description:
    "Trading calls published to Arkiv before execution, so the ones that never happened stay on the record.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
