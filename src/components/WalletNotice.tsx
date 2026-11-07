"use client";

import { useWallet } from "@/lib/wallet";

/** A notice under the header when the wallet is on a different network from the app. */
export function WalletNotice() {
  const { networkProblem } = useWallet();
  if (!networkProblem) return null;
  return (
    <div className="container">
      <p className="message message-error wallet-notice" role="alert">
        {networkProblem}
      </p>
    </div>
  );
}
