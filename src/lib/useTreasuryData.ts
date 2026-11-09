"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
          const [{ limit, period }, spent] = await Promise.all([client.getSpendLimit(asset), client.getSpent(asset)]);
          return { asset, limit, period, spent };
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
