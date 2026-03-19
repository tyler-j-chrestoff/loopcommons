import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { JetBrains_Mono, Literata } from "next/font/google";
import { SeasonInitializer } from "@/components/SeasonInitializer";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-prose",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Loop Commons",
  description: "Conversational AI with full observability",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-season="spring"
      className={`${jetbrainsMono.variable} ${literata.variable}`}
    >
      <body className="bg-bg text-text font-mono antialiased">
        <SeasonInitializer />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
