"use client";

import { Networks } from "@stellar/stellar-sdk";
import {
  WatchWalletChanges,
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Signer } from "treasury-sdk";
import { config } from "./config";

export type WalletStatus = "disconnected" | "connecting" | "connected";

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  error: string | null;
  /** The network passphrase the wallet is set to, once known. */
  walletPassphrase: string | null;
  /** Set when the wallet is on a different network from the app. Says what to do. */
  networkProblem: string | null;
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

/** A name for a network passphrase, for messages. */
export function networkName(passphrase: string): string {
  if (passphrase === Networks.TESTNET) return "Testnet";
  if (passphrase === Networks.PUBLIC) return "Mainnet";
  if (passphrase === Networks.FUTURENET) return "Futurenet";
  return "a custom network";
}

/** What to tell the person when the wallet and the app are on different networks, or null if they match. */
export function networkMismatch(walletPassphrase: string | null, appPassphrase: string): string | null {
  if (!walletPassphrase || walletPassphrase === appPassphrase) return null;
  return `Your wallet is on ${networkName(walletPassphrase)}, but this app uses ${networkName(appPassphrase)}. Switch the network in Freighter to ${networkName(appPassphrase)}.`;
}

function makeSigner(address: string, problem: string | null): Signer {
  return {
    publicKey: address,
    async signTransaction(xdr, { networkPassphrase }) {
      if (problem) throw new Error(problem);
      const result = await signTransaction(xdr, { networkPassphrase, address });
      if (result.error) throw new Error(result.error.message || "The wallet did not sign the transaction.");
      if (result.signerAddress && result.signerAddress !== address) {
        throw new Error("The wallet signed with a different account. Pick the connected account in Freighter and try again.");
      }
      return result.signedTxXdr;
    },
  };
}

/** Connects to the Freighter browser wallet and follows account and network changes made in it. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<string | null>(null);
  const [walletPassphrase, setWalletPassphrase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readNetwork = useCallback(async () => {
    try {
      const details = await getNetworkDetails();
      if (!details.error && details.networkPassphrase) setWalletPassphrase(details.networkPassphrase);
    } catch {
      // Unknown network: signing will still say if it is wrong.
    }
  }, []);

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
        await readNetwork();
      } catch {
        // Stay disconnected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readNetwork]);

  // Follow the account and network picked in Freighter, so switching accounts (to approve as another owner)
  // or networks shows up here straight away.
  useEffect(() => {
    if (status !== "connected") return;
    const watcher = new WatchWalletChanges(2000);
    watcher.watch(({ address: next, networkPassphrase, error: watchError }) => {
      if (watchError) return;
      if (next) setAddress(next);
      if (networkPassphrase) setWalletPassphrase(networkPassphrase);
    });
    return () => watcher.stop();
  }, [status]);

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
      await readNetwork();
    } catch (e) {
      setAddress(null);
      setStatus("disconnected");
      setError(e instanceof Error ? e.message : "Could not connect the wallet.");
    }
  }, [readNetwork]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setWalletPassphrase(null);
    setStatus("disconnected");
    setError(null);
    remember(false);
  }, []);

  const networkProblem = status === "connected" ? networkMismatch(walletPassphrase, config.networkPassphrase) : null;

  const value = useMemo<WalletState>(
    () => ({
      status,
      address,
      error,
      walletPassphrase,
      networkProblem,
      signer: address ? makeSigner(address, networkProblem) : null,
      connect,
      disconnect,
    }),
    [status, address, error, walletPassphrase, networkProblem, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>.");
  return ctx;
}

/** The network the app talks to, for display. */
export const networkLabel = config.networkLabel;
