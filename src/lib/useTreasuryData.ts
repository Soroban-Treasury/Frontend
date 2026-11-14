"use client";

import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Config, Proposal } from "treasury-sdk";
import { config as appConfig } from "./config";
import { errorMessage, makeClient } from "./treasury";

export interface LimitView {
  asset: string;
  limit: bigint;
  /** Period length in seconds. */
  period: bigint;
  /** Spent in the current period. */
  spent: bigint;
  /**
   * Unix timestamp (seconds) when the current spending window started on-chain,
   * or `null` when nothing has been spent for this asset yet.
   */
  periodStart?: number | null;
}

async function readPeriodStart(contractId: string, asset: string): Promise<number | null> {
  try {
    const server = new rpc.Server(appConfig.rpcUrl, { allowHttp: appConfig.rpcUrl.startsWith("http://") });
    const key = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Spent"), new Address(asset).toScVal()]);
    const entry = await server.getContractData(contractId, key, rpc.Durability.Persistent);
    if (entry.val.type !== "contractData") return null;
    const value = entry.val.contractData.val;
    const decoded = scValToNative(value) as { start?: bigint | number } | null;
    if (decoded && typeof decoded === "object" && decoded.start !== undefined) {
      const start = Number(decoded.start);
      return Number.isFinite(start) && start > 0 ? start : null;
    }
  } catch {
    // No `Spent` ledger entry yet (nothing spent), or custom RPC unavailable.
  }
  return null;
}

export interface TreasuryData {
  config: Config;
  limits: LimitView[];
  /** Newest first. `null` while they are still loading. */
  proposals: Proposal[] | null;
}

export interface TreasuryDataState {
  data: TreasuryData | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

interface Overview {
  config: Config;
  limits: LimitView[];
}

/**
 * Read a treasury from the chain: owners, limits and recent proposals.
 *
 * Every read is a simulation on the RPC, which can take seconds on a public RPC, so the
 * overview and the proposals load side by side and each shows up as soon as it arrives.
 */
export function useTreasuryData(contractId: string | null): TreasuryDataState {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(contractId !== null);

  const load = useCallback(async () => {
    if (!contractId) return;
    const client = makeClient(contractId);

    const loadOverview = async () => {
      const [config, assets] = await Promise.all([client.getConfig(), client.getPolicyAssets()]);
      const limits = await Promise.all(
        assets.map(async (asset): Promise<LimitView> => {
          const [{ limit, period }, spent, periodStart] = await Promise.all([
            client.getSpendLimit(asset),
            client.getSpent(asset),
            readPeriodStart(contractId, asset),
          ]);
          return { asset, limit, period, spent, periodStart };
        }),
      );
      setOverview({ config, limits });
    };
    const loadProposals = async () => setProposals(await client.listProposals({ limit: 50 }));

    try {
      await Promise.all([loadOverview(), loadProposals()]);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    setOverview(null);
    setProposals(null);
    setError(null);
    setLoading(contractId !== null);
    void load();
  }, [contractId, load]);

  const data = useMemo(() => (overview ? { ...overview, proposals } : null), [overview, proposals]);
  return { data, error, loading: loading && overview === null, reload: load };
}
