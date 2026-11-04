"use client";

import { useEffect, useState } from "react";
import { config } from "@/lib/config";

interface Entry {
  seq: number;
  type: string;
  proposalId: number | null;
  txHash: string;
  at: string;
}

const LABELS: Record<string, string> = {
  initialized: "Treasury created",
  limit_set: "Spending limit set",
  limit_removed: "Spending limit removed",
  proposed: "Payment proposed",
  approved: "Proposal approved",
  executed: "Payment made",
};

/** Event history from treasury-api. Renders nothing if no API is configured. */
export function AuditLog({ treasuryId }: { treasuryId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!config.apiUrl) return;
    let cancelled = false;
    fetch(`${config.apiUrl}/treasuries/${treasuryId}/audit-log?limit=50`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ entries: Entry[] }>;
      })
      .then((body) => {
        if (!cancelled) setEntries(body.entries);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [treasuryId]);

  if (!config.apiUrl) return null;

  return (
    <section className="card" aria-labelledby="audit-heading">
      <h2 id="audit-heading">Activity log</h2>
      {failed ? <p className="message message-error" role="alert">The activity log could not be loaded.</p> : null}
      {!failed && entries === null ? <p className="muted">Loading…</p> : null}
      {entries && entries.length === 0 ? <p className="empty">No activity recorded yet.</p> : null}
      {entries && entries.length > 0 ? (
        <ol className="plain-list">
          {entries.map((e) => (
            <li key={e.seq}>
              <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time> ·{" "}
              {LABELS[e.type] ?? e.type}
              {e.proposalId !== null ? ` (proposal #${e.proposalId})` : ""}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
