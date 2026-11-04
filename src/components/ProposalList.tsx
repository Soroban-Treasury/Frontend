"use client";

import type { Proposal } from "treasury-sdk";
import { formatAmount, shortAddress, timeLeft } from "@/lib/amount";
import { assetLabel, proposalState } from "@/lib/treasury";
import type { ProposalState } from "@/lib/treasury";

const STATE_LABEL: Record<ProposalState, string> = {
  open: "Needs approvals",
  ready: "Ready to execute",
  executed: "Paid",
  expired: "Expired",
};

interface Props {
  proposals: Proposal[];
  threshold: number;
  /** The connected account, if any. */
  address: string | null;
  owners: string[];
  nowSeconds: number;
  /** Proposal currently being sent, to disable its buttons. */
  busyId: bigint | null;
  onApprove: (id: bigint) => void;
  onExecute: (id: bigint) => void;
  emptyText?: string;
}

export function ProposalList({
  proposals,
  threshold,
  address,
  owners,
  nowSeconds,
  busyId,
  onApprove,
  onExecute,
  emptyText = "No proposals yet.",
}: Props) {
  if (proposals.length === 0) return <p className="empty">{emptyText}</p>;

  const isOwner = address !== null && owners.includes(address);

  return (
    <ul className="proposal-list">
      {proposals.map((p) => {
        const state = proposalState(p, threshold, nowSeconds);
        const approved = address !== null && p.approvals.includes(address);
        const busy = busyId === p.id;
        const headingId = `proposal-${p.id}-heading`;
        return (
          <li key={String(p.id)} className="card proposal" aria-labelledby={headingId}>
            <div className="proposal-head">
              <h3 id={headingId}>Proposal #{String(p.id)}</h3>
              <span className={`badge badge-${state}`}>{STATE_LABEL[state]}</span>
            </div>

            <p className="proposal-pay">
              Pay{" "}
              <strong>
                {formatAmount(p.amount)} {assetLabel(p.asset)}
              </strong>{" "}
              to <span title={p.to}>{shortAddress(p.to)}</span>
            </p>

            <p className="proposal-meta">
              Approvals: {p.approvals.length} of {threshold} needed
              {state === "open" || state === "ready" ? ` · Closes in ${timeLeft(p.expiresAt, nowSeconds)}` : null}
            </p>
            <progress
              max={threshold}
              value={Math.min(p.approvals.length, threshold)}
              aria-label={`Approvals for proposal ${p.id}`}
            />
            <p className="proposal-meta">
              Approved by: {p.approvals.map((a) => (a === address ? "you" : shortAddress(a))).join(", ")}
            </p>

            {state === "open" || state === "ready" ? (
              <div className="actions">
                {isOwner && !approved && state === "open" ? (
                  <button
                    type="button"
                    className="button"
                    disabled={busyId !== null}
                    onClick={() => onApprove(p.id)}
                    aria-label={`Approve proposal ${p.id}`}
                  >
                    {busy ? "Approving…" : "Approve"}
                  </button>
                ) : null}
                {isOwner && state === "ready" ? (
                  <button
                    type="button"
                    className="button"
                    disabled={busyId !== null}
                    onClick={() => onExecute(p.id)}
                    aria-label={`Execute proposal ${p.id}`}
                  >
                    {busy ? "Executing…" : "Execute payment"}
                  </button>
                ) : null}
                {!isOwner ? <p className="hint">Connect an owner&rsquo;s wallet to approve or execute.</p> : null}
                {isOwner && approved && state === "open" ? (
                  <p className="hint">You approved this. Waiting for other owners.</p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
