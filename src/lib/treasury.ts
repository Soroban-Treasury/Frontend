import { Asset } from "@stellar/stellar-sdk";
import { TreasuryClient } from "treasury-sdk";
import type { Proposal, Signer } from "treasury-sdk";
import { config } from "./config";

export function makeClient(contractId: string, signer?: Signer): TreasuryClient {
  return new TreasuryClient({
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    signer,
  });
}

/** Contract id of the network's native XLM token. */
export function nativeAssetId(): string {
  return Asset.native().contractId(config.networkPassphrase);
}

export function assetLabel(assetId: string): string {
  return assetId === nativeAssetId() ? "XLM" : `${assetId.slice(0, 4)}…${assetId.slice(-4)}`;
}

export type ProposalState = "open" | "ready" | "executed" | "expired";

/**
 * Where a proposal stands: `ready` once it has enough approvals to execute,
 * `expired` if it ran out of time without being executed.
 */
export function proposalState(proposal: Proposal, threshold: number, nowSeconds: number): ProposalState {
  if (proposal.executed) return "executed";
  if (proposal.expiresAt < BigInt(nowSeconds)) return "expired";
  return proposal.approvals.length >= threshold ? "ready" : "open";
}

/** Turn an error from the SDK or wallet into a sentence for the screen. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
