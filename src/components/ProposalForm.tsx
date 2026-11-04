"use client";

import { StrKey } from "@stellar/stellar-sdk";
import { useState } from "react";
import type { FormEvent } from "react";
import { AmountError, formatAmount, parseAmount } from "@/lib/amount";
import { errorMessage } from "@/lib/treasury";
import { StatusMessage } from "./StatusMessage";

export interface AssetOption {
  id: string;
  label: string;
  /** Most that can be spent per period. */
  limit: bigint;
  /** Left to spend in the current period. */
  remaining: bigint;
}

export interface ProposalInput {
  asset: string;
  to: string;
  amount: bigint;
  ttlSeconds: number;
}

interface Props {
  assets: AssetOption[];
  /** The signed-in account can only propose if it is an owner. */
  canPropose: boolean;
  /** Why it can't, shown to the person. */
  reason?: string;
  onSubmit: (input: ProposalInput) => Promise<void>;
}

// TODO(wave: app-1): preview the proposal against the spending limit before it is sent.
export function ProposalForm({ assets, canPropose, reason, onSubmit }: Props) {
  const [asset, setAsset] = useState(assets[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("7");
  const [errors, setErrors] = useState<{ to?: string; amount?: string; days?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selected = assets.find((a) => a.id === (asset || assets[0]?.id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    setDone(false);
    const next: typeof errors = {};

    const recipient = to.trim();
    if (!StrKey.isValidEd25519PublicKey(recipient) && !StrKey.isValidContract(recipient)) {
      next.to = "Enter a Stellar address that starts with G or C.";
    }

    let value = 0n;
    try {
      value = parseAmount(amount);
      if (selected && value > selected.limit) {
        next.amount = `That is above the spending limit of ${formatAmount(selected.limit)} ${selected.label}.`;
      }
    } catch (e) {
      next.amount = e instanceof AmountError ? e.message : "Enter a valid amount.";
    }

    const d = Number(days);
    if (!Number.isInteger(d) || d < 1 || d > 30) next.days = "Enter a whole number of days from 1 to 30.";

    setErrors(next);
    if (Object.keys(next).length > 0 || !selected) return;

    setBusy(true);
    try {
      await onSubmit({ asset: selected.id, to: recipient, amount: value, ttlSeconds: d * 86400 });
      setTo("");
      setAmount("");
      setDone(true);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (assets.length === 0) {
    return (
      <section className="card" aria-labelledby="propose-heading">
        <h2 id="propose-heading">Propose a payment</h2>
        <StatusMessage kind="info">
          This treasury has no spending limits, so nothing can be spent from it.
        </StatusMessage>
      </section>
    );
  }

  const bad = (key: keyof typeof errors) => ({
    "aria-invalid": errors[key] ? (true as const) : undefined,
    "aria-describedby": errors[key] ? `propose-${key}-error` : undefined,
  });

  return (
    <form onSubmit={submit} noValidate aria-labelledby="propose-heading" className="card form">
      <h2 id="propose-heading">Propose a payment</h2>

      {assets.length > 1 ? (
        <div className="field">
          <label htmlFor="propose-asset">Token</label>
          <select id="propose-asset" value={selected?.id ?? ""} onChange={(e) => setAsset(e.target.value)}>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="propose-to">Send to</label>
        <input
          id="propose-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          {...bad("to")}
        />
        {errors.to ? (
          <p id="propose-to-error" className="field-error">
            {errors.to}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="propose-amount">Amount{selected ? ` (${selected.label})` : ""}</label>
        <input
          id="propose-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          {...bad("amount")}
        />
        {selected ? (
          <p className="hint">
            {formatAmount(selected.remaining)} {selected.label} left to spend in this period (limit{" "}
            {formatAmount(selected.limit)}).
          </p>
        ) : null}
        {errors.amount ? (
          <p id="propose-amount-error" className="field-error">
            {errors.amount}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="propose-days">Open for how many days</label>
        <input
          id="propose-days"
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          {...bad("days")}
        />
        <p className="hint">Owners must approve and execute it within this time. Up to 30 days.</p>
        {errors.days ? (
          <p id="propose-days-error" className="field-error">
            {errors.days}
          </p>
        ) : null}
      </div>

      {!canPropose && reason ? <StatusMessage kind="info">{reason}</StatusMessage> : null}
      {busy ? <StatusMessage kind="info">Sending. Approve the request in your wallet.</StatusMessage> : null}
      {done ? <StatusMessage kind="success">Proposal created. You have approved it.</StatusMessage> : null}
      {failure ? <StatusMessage kind="error">{failure}</StatusMessage> : null}

      <button type="submit" className="button" disabled={busy || !canPropose}>
        {busy ? "Sending…" : "Propose payment"}
      </button>
    </form>
  );
}
