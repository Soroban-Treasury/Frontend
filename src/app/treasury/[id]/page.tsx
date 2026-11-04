"use client";

import { StrKey } from "@stellar/stellar-sdk";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuditLog } from "@/components/AuditLog";
import { ProposalForm } from "@/components/ProposalForm";
import type { ProposalInput } from "@/components/ProposalForm";
import { ProposalList } from "@/components/ProposalList";
import { StatusMessage } from "@/components/StatusMessage";
import { TreasuryOverview } from "@/components/TreasuryOverview";
import { assetLabel, errorMessage, makeClient, proposalState } from "@/lib/treasury";
import { useTreasuryData } from "@/lib/useTreasuryData";
import { useWallet } from "@/lib/wallet";

export default function TreasuryPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  const valid = StrKey.isValidContract(id);

  const { address, signer } = useWallet();
  const { data, error, loading, reload } = useTreasuryData(valid ? id : null);

  const [busyId, setBusyId] = useState<bigint | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The clock decides what is expired; refresh it every 30 seconds.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(timer);
  }, []);

  const owners = data?.config.owners ?? [];
  const threshold = data?.config.threshold ?? 0;
  const isOwner = address !== null && owners.includes(address);

  const assets = useMemo(
    () =>
      (data?.limits ?? []).map((l) => ({
        id: l.asset,
        label: assetLabel(l.asset),
        limit: l.limit,
        remaining: l.limit > l.spent ? l.limit - l.spent : 0n,
      })),
    [data],
  );

  const current = useMemo(
    () => (data?.proposals ?? []).filter((p) => ["open", "ready"].includes(proposalState(p, threshold, now))),
    [data, threshold, now],
  );
  const past = useMemo(
    () => (data?.proposals ?? []).filter((p) => ["executed", "expired"].includes(proposalState(p, threshold, now))),
    [data, threshold, now],
  );

  if (!valid) {
    return (
      <>
        <h1>Treasury not found</h1>
        <StatusMessage kind="error">That is not a valid treasury contract id.</StatusMessage>
        <p>
          <Link href="/">Back to your treasuries</Link>
        </p>
      </>
    );
  }

  async function propose(input: ProposalInput) {
    if (!signer) throw new Error("Connect your wallet first.");
    await makeClient(id, signer).propose(input);
    setNotice(null);
    await reload();
  }

  async function act(proposalId: bigint, kind: "approve" | "execute") {
    if (!signer) {
      setActionError("Connect your wallet first.");
      return;
    }
    setBusyId(proposalId);
    setActionError(null);
    setNotice(null);
    try {
      const client = makeClient(id, signer);
      if (kind === "approve") await client.approve(proposalId);
      else await client.execute(proposalId);
      setNotice(kind === "approve" ? `Proposal #${proposalId} approved.` : `Proposal #${proposalId} paid.`);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <p>
        <Link href="/">&larr; All treasuries</Link>
      </p>
      <h1>Treasury</h1>
      <p className="muted contract-id">{id}</p>

      {loading ? <p role="status">Loading treasury…</p> : null}
      {error ? (
        <StatusMessage kind="error">
          Could not load this treasury: {error}{" "}
          <button type="button" className="button button-link" onClick={() => void reload()}>
            Try again
          </button>
        </StatusMessage>
      ) : null}

      {data ? (
        <>
          <TreasuryOverview owners={owners} threshold={threshold} limits={data.limits} address={address} />

          <ProposalForm
            assets={assets}
            canPropose={isOwner}
            reason={
              !address ? "Connect your wallet to propose a payment." : "Only owners of this treasury can propose payments."
            }
            onSubmit={propose}
          />

          <section aria-labelledby="open-proposals-heading">
            <h2 id="open-proposals-heading">Open proposals</h2>
            {notice ? <StatusMessage kind="success">{notice}</StatusMessage> : null}
            {actionError ? <StatusMessage kind="error">{actionError}</StatusMessage> : null}
            <ProposalList
              proposals={current}
              threshold={threshold}
              address={address}
              owners={owners}
              nowSeconds={now}
              busyId={busyId}
              onApprove={(pid) => void act(pid, "approve")}
              onExecute={(pid) => void act(pid, "execute")}
              emptyText="Nothing waiting for approval."
            />
          </section>

          <section aria-labelledby="history-heading">
            <h2 id="history-heading">History</h2>
            <ProposalList
              proposals={past}
              threshold={threshold}
              address={address}
              owners={owners}
              nowSeconds={now}
              busyId={null}
              onApprove={() => undefined}
              onExecute={() => undefined}
              emptyText="No payments made or expired yet."
            />
          </section>

          <AuditLog treasuryId={id} />
        </>
      ) : null}
    </>
  );
}
