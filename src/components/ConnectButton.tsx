"use client";

import { shortAddress } from "@/lib/amount";
import { useWallet } from "@/lib/wallet";

export function ConnectButton() {
  const { status, address, error, connect, disconnect } = useWallet();

  if (status === "connected" && address) {
    return (
      <div className="wallet">
        <span className="wallet-address" title={address}>
          <span className="visually-hidden">Connected account </span>
          {shortAddress(address)}
        </span>
        <button type="button" className="button button-secondary" onClick={disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet">
      <button type="button" className="button" onClick={connect} disabled={status === "connecting"}>
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
      {error ? (
        <p className="message message-error wallet-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
