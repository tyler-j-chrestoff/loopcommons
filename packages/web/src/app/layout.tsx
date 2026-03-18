import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="bg-bg text-text font-mono antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
