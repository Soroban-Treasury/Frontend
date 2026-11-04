"use client";

import { useCallback, useEffect, useState } from "react";
import type { Config, Proposal } from "treasury-sdk";
import { errorMessage, makeClient } from "./treasury";

export interface LimitView {
  asset: string;
  limit: bigint;
  /** Period length in seconds. */
  period: bigint;
  /** Spent in the current period. */
  spent: bigint;
}

export interface TreasuryData {
  config: Config;
  limits: LimitView[];
  /** Newest first. */
  proposals: Proposal[];
}

export interface TreasuryDataState {
  data: TreasuryData | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Read a treasury from the chain: owners, limits and recent proposals. */
export function useTreasuryData(contractId: string | null): TreasuryDataState {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(contractId !== null);

  const load = useCallback(async () => {
    if (!contractId) return;
    try {
      const client = makeClient(contractId);
      const [config, assets, proposals] = await Promise.all([
        client.getConfig(),
        client.getPolicyAssets(),
        client.listProposals({ limit: 50 }),
      ]);
      const limits = await Promise.all(
        assets.map(async (asset): Promise<LimitView> => {
          const [{ limit, period }, spent] = await Promise.all([client.getSpendLimit(asset), client.getSpent(asset)]);
          return { asset, limit, period, spent };
        }),
      );
      setData({ config, limits, proposals });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    setLoading(contractId !== null);
    void load();
  }, [contractId, load]);

  return { data, error, loading, reload: load };
}
