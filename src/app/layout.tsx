import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { WalletNotice } from "@/components/WalletNotice";
import { networkLabel, WalletProvider } from "@/lib/wallet";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stellar Treasury",
  description: "Team treasuries on Stellar with spending limits and shared approval.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <WalletProvider>
          <header className="site-header">
            <div className="container header-inner">
              <Link href="/" className="brand">
                Stellar Treasury
              </Link>
              <nav aria-label="Main">
                <Link href="/demo">Live demo</Link>
              </nav>
              <span className="badge badge-network">{networkLabel}</span>
              <div className="header-wallet">
                <ConnectButton />
              </div>
            </div>
          </header>
          <WalletNotice />
          <main id="main" className="container">
            {children}
          </main>
          <footer className="container site-footer">
            <p>Smart contracts carry risk. Read the security notes in the project README before moving funds.</p>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
