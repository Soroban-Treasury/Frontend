import { Networks } from "@stellar/stellar-sdk";

// Next.js only inlines NEXT_PUBLIC_* variables when they are written out in full like this.
export const config = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org",
  networkPassphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.TESTNET,
  wasmHash: process.env.NEXT_PUBLIC_WASM_HASH || "",
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, ""),
};

/** Stellar assets use 7 decimal places. */
export const ASSET_DECIMALS = 7;
