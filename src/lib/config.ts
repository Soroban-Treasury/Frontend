import { Networks } from "@stellar/stellar-sdk";

/** SHA-256 of `public/contract/treasury_contract.wasm`, the contract code this app ships with. */
export const BUNDLED_WASM_HASH = "1f6e5b53c3ad153ac813a0f15beeac352b7e72b8731737f69e50d2c7bf1b640b";

/** Where the bundled contract code is served, relative to the site root. */
export const BUNDLED_WASM_PATH = "/contract/treasury_contract.wasm";

export type NetworkName = "testnet" | "mainnet" | "custom";

interface NetworkPreset {
  passphrase: string;
  rpcUrl: string;
  explorerUrl: string;
  label: string;
}

export const NETWORKS: Record<Exclude<NetworkName, "custom">, NetworkPreset> = {
  testnet: {
    passphrase: Networks.TESTNET,
    rpcUrl: "https://soroban-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    label: "Testnet",
  },
  mainnet: {
    passphrase: Networks.PUBLIC,
    rpcUrl: "https://mainnet.sorobanrpc.com",
    explorerUrl: "https://stellar.expert/explorer/public",
    label: "Mainnet",
  },
};

/**
 * Work out the network from the settings. `NEXT_PUBLIC_NETWORK` picks a preset; a passphrase on its own
 * also works, and anything that is neither testnet nor mainnet is a custom network (for example a local one).
 */
export function resolveNetwork(env: {
  network?: string;
  passphrase?: string;
  rpcUrl?: string;
}): { name: NetworkName; passphrase: string; rpcUrl: string; explorerUrl: string | null; label: string } {
  const named = env.network?.trim().toLowerCase();
  let name: NetworkName;
  if (named === "mainnet" || named === "public") name = "mainnet";
  else if (named === "testnet") name = "testnet";
  else if (!env.passphrase || env.passphrase === Networks.TESTNET) name = "testnet";
  else if (env.passphrase === Networks.PUBLIC) name = "mainnet";
  else name = "custom";

  if (name === "custom") {
    return {
      name,
      passphrase: env.passphrase!,
      rpcUrl: env.rpcUrl || "",
      explorerUrl: null,
      label: "Custom network",
    };
  }
  const preset = NETWORKS[name];
  return {
    name,
    passphrase: env.passphrase || preset.passphrase,
    rpcUrl: env.rpcUrl || preset.rpcUrl,
    explorerUrl: preset.explorerUrl,
    label: preset.label,
  };
}

// Next.js only inlines NEXT_PUBLIC_* variables when they are written out in full like this.
const network = resolveNetwork({
  network: process.env.NEXT_PUBLIC_NETWORK,
  passphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
});

export const config = {
  network: network.name,
  networkLabel: network.label,
  rpcUrl: network.rpcUrl,
  networkPassphrase: network.passphrase,
  /** Stellar Expert for this network, or null on a custom network. */
  explorerUrl: network.explorerUrl,
  /** Hex hash of the treasury contract code to deploy. Defaults to the code bundled with the app. */
  wasmHash: (process.env.NEXT_PUBLIC_WASM_HASH || BUNDLED_WASM_HASH).trim().toLowerCase(),
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, ""),
  /** Set when the app is served from a sub-path, for example `/Frontend` on GitHub Pages. */
  basePath: (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, ""),
};

/** Stellar assets use 7 decimal places. */
export const ASSET_DECIMALS = 7;

/** Link to the treasury page for a contract id. */
export function treasuryHref(id: string): string {
  return `/treasury/?id=${encodeURIComponent(id)}`;
}

/** URL of a file in `public/`, including the base path. Next.js links add the base path themselves. */
export function publicUrl(path: string): string {
  return `${config.basePath}${path}`;
}
