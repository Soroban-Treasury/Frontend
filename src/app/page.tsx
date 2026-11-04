"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateTreasuryForm } from "@/components/CreateTreasuryForm";
import type { CreateParams } from "@/components/CreateTreasuryForm";
import { OpenTreasuryForm } from "@/components/OpenTreasuryForm";
import { shortAddress } from "@/lib/amount";
import { config } from "@/lib/config";
import { loadSaved, removeTreasury, saveTreasury } from "@/lib/storage";
import type { SavedTreasury } from "@/lib/storage";
import { nativeAssetId } from "@/lib/treasury";
import { useWallet } from "@/lib/wallet";
import { TreasuryClient } from "treasury-sdk";

export default function Home() {
  const router = useRouter();
  const { address, signer } = useWallet();
  const [saved, setSaved] = useState<SavedTreasury[]>([]);

  // Read from storage after mount so the first render matches the server.
  useEffect(() => setSaved(loadSaved()), []);

  function open(id: string, name: string) {
    setSaved(saveTreasury({ id, name }));
    router.push(`/treasury/${id}`);
  }

  async function create(params: CreateParams) {
    if (!signer) throw new Error("Connect your wallet first.");
    const treasury = await TreasuryClient.create({
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
      wasmHash: config.wasmHash,
      signer,
      owners: params.owners,
      threshold: params.threshold,
      limits: [{ asset: params.asset, limit: params.limit, periodSeconds: params.periodSeconds }],
    });
    open(treasury.contractId, params.name);
  }

  return (
    <>
      <h1>Team treasuries with rules</h1>
      <p className="lead">
        Hold funds together on Stellar. Every payment needs approval from several owners and stays within a spending
        limit.
      </p>

      <section aria-labelledby="saved-heading" className="card">
        <h2 id="saved-heading">Your treasuries</h2>
        {saved.length === 0 ? (
          <p className="empty">No treasuries yet. Create one or open one below.</p>
        ) : (
          <ul className="plain-list saved-list">
            {saved.map((t) => (
              <li key={t.id}>
                <Link href={`/treasury/${t.id}`}>
                  {t.name} <span className="muted">({shortAddress(t.id, 6)})</span>
                </Link>
                <button
                  type="button"
                  className="button button-link"
                  onClick={() => setSaved(removeTreasury(t.id))}
                  aria-label={`Forget ${t.name}`}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid">
        <CreateTreasuryForm
          address={address}
          wasmHash={config.wasmHash}
          defaultAsset={nativeAssetId()}
          onCreate={create}
        />
        <OpenTreasuryForm onOpen={open} />
      </div>
    </>
  );
}
