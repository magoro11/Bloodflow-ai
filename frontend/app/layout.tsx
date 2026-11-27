import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BloodFlow AI | Supply intelligence",
  description: "Simulated blood supply forecasting and coordination for Kenya.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
