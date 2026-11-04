"use client";

import { getAddress, isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Signer } from "treasury-sdk";
import { config } from "./config";

export type WalletStatus = "disconnected" | "connecting" | "connected";

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  error: string | null;
  /** Ready to sign when connected. */
  signer: Signer | null;
  connect(): Promise<void>;
  disconnect(): void;
}

const WalletContext = createContext<WalletState | null>(null);

const REMEMBER_KEY = "treasury-app:wallet-connected";

function remember(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(REMEMBER_KEY, "1");
    else window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Not remembering is fine.
  }
}

function wasConnected(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

function makeSigner(address: string): Signer {
  return {
    publicKey: address,
    async signTransaction(xdr, { networkPassphrase }) {
      const result = await signTransaction(xdr, { networkPassphrase, address });
      if (result.error) throw new Error(result.error.message || "The wallet did not sign the transaction.");
      return result.signedTxXdr;
    },
  };
}

/** Connects to the Freighter browser wallet. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reconnect quietly if the person connected before and the wallet still allows this site.
  useEffect(() => {
    if (!wasConnected()) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getAddress();
        if (cancelled || result.error || !result.address) return;
        setAddress(result.address);
        setStatus("connected");
      } catch {
        // Stay disconnected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const installed = await isConnected();
      if (installed.error || !installed.isConnected) {
        throw new Error("Freighter wallet not found. Install the Freighter extension, then try again.");
      }
      const access = await requestAccess();
      if (access.error || !access.address) {
        throw new Error(access.error?.message || "The wallet did not share an account.");
      }
      setAddress(access.address);
      setStatus("connected");
      remember(true);
    } catch (e) {
      setAddress(null);
      setStatus("disconnected");
      setError(e instanceof Error ? e.message : "Could not connect the wallet.");
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus("disconnected");
    setError(null);
    remember(false);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      status,
      address,
      error,
      signer: address ? makeSigner(address) : null,
      connect,
      disconnect,
    }),
    [status, address, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>.");
  return ctx;
}

/** The network the app talks to, for display. */
export const networkLabel = config.networkPassphrase.includes("Test")
  ? "Testnet"
  : config.networkPassphrase.includes("Public")
    ? "Mainnet"
    : "Custom network";
