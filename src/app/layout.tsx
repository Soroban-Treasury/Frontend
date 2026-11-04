import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConnectButton } from "@/components/ConnectButton";
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
              <span className="badge badge-network">{networkLabel}</span>
              <div className="header-wallet">
                <ConnectButton />
              </div>
            </div>
          </header>
          <main id="main" className="container">
            {children}
          </main>
          <footer className="container site-footer">
            <p>
              Unaudited. Testnet only. Do not put money you can&rsquo;t afford to lose in a treasury here.
            </p>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
