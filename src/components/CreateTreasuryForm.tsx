"use client";

import { StrKey } from "@stellar/stellar-sdk";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AmountError, parseAmount } from "@/lib/amount";
import { errorMessage } from "@/lib/treasury";
import { StatusMessage } from "./StatusMessage";

export interface CreateValues {
  name: string;
  owners: string;
  threshold: string;
  asset: string;
  limit: string;
  periodDays: string;
}

export interface CreateParams {
  name: string;
  owners: string[];
  threshold: number;
  asset: string;
  limit: bigint;
  periodSeconds: number;
}

export type CreateErrors = Partial<Record<keyof CreateValues, string>>;

export const MAX_OWNERS = 10;

/** Check the form. Returns the parsed values, or a message for each bad field. */
export function validateCreate(values: CreateValues): { params: CreateParams } | { errors: CreateErrors } {
  const errors: CreateErrors = {};

  const owners = values.owners
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (owners.length === 0) errors.owners = "Add at least one owner.";
  else if (owners.length > MAX_OWNERS) errors.owners = `A treasury can have at most ${MAX_OWNERS} owners.`;
  else if (owners.some((o) => !StrKey.isValidEd25519PublicKey(o))) {
    errors.owners = "Every owner must be a Stellar account address that starts with G.";
  } else if (new Set(owners).size !== owners.length) errors.owners = "Each owner can only be listed once.";

  const threshold = Number(values.threshold);
  if (!Number.isInteger(threshold) || threshold < 1) errors.threshold = "Enter a whole number, 1 or more.";
  else if (owners.length > 0 && threshold > owners.length) {
    errors.threshold = "The number of approvals can't be more than the number of owners.";
  }

  if (!StrKey.isValidContract(values.asset.trim())) {
    errors.asset = "Enter a token contract id. It starts with C.";
  }

  let limit = 0n;
  try {
    limit = parseAmount(values.limit);
  } catch (e) {
    errors.limit = e instanceof AmountError ? e.message : "Enter a valid amount.";
  }

  const days = Number(values.periodDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) errors.periodDays = "Enter a whole number of days from 1 to 365.";

  if (Object.keys(errors).length > 0) return { errors };
  return {
    params: {
      name: values.name.trim() || "Untitled treasury",
      owners,
      threshold,
      asset: values.asset.trim(),
      limit,
      periodSeconds: days * 86400,
    },
  };
}

interface Props {
  /** The connected account. It is filled in as the first owner. */
  address: string | null;
  /** Why creating is not possible right now (for example the wallet is on another network), or null. */
  blockedReason?: string | null;
  defaultAsset: string;
  /** Create the treasury. `report` updates the progress message while it works. */
  onCreate: (params: CreateParams, report: (progress: string) => void) => Promise<void>;
}

export function CreateTreasuryForm({ address, blockedReason = null, defaultAsset, onCreate }: Props) {
  const [values, setValues] = useState<CreateValues>({
    name: "",
    owners: "",
    threshold: "2",
    asset: defaultAsset,
    limit: "",
    periodDays: "7",
  });
  const [errors, setErrors] = useState<CreateErrors>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("Creating the treasury. Approve the request in your wallet.");
  const [failure, setFailure] = useState<string | null>(null);

  // Start the owners list with the connected account.
  useEffect(() => {
    if (address) setValues((v) => (v.owners.trim() === "" ? { ...v, owners: address } : v));
  }, [address]);

  const set = (key: keyof CreateValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    const result = validateCreate(values);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    setProgress("Creating the treasury. Approve the request in your wallet.");
    try {
      await onCreate(result.params, setProgress);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const needsWallet = !address;

  const field = (key: keyof CreateValues) => ({
    "aria-invalid": errors[key] ? (true as const) : undefined,
    "aria-describedby": errors[key] ? `create-${key}-error` : undefined,
  });
  const error = (key: keyof CreateValues) =>
    errors[key] ? (
      <p id={`create-${key}-error`} className="field-error">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate aria-labelledby="create-heading" className="card form">
      <h2 id="create-heading">Create a treasury</h2>
      <p className="help">
        Owners share the treasury. A payment needs the chosen number of owners to approve it, and can never go above the
        spending limit you set here.
      </p>

      <div className="field">
        <label htmlFor="create-name">
          Name <span className="optional">(optional, only saved in this browser)</span>
        </label>
        <input id="create-name" value={values.name} onChange={set("name")} maxLength={60} />
      </div>

      <div className="field">
        <label htmlFor="create-owners">Owners</label>
        <textarea
          id="create-owners"
          rows={4}
          value={values.owners}
          onChange={set("owners")}
          spellCheck={false}
          {...field("owners")}
        />
        <p className="hint">One account address (G…) per line. Up to {MAX_OWNERS}.</p>
        {error("owners")}
      </div>

      <div className="field">
        <label htmlFor="create-threshold">Approvals needed</label>
        <input
          id="create-threshold"
          inputMode="numeric"
          value={values.threshold}
          onChange={set("threshold")}
          {...field("threshold")}
        />
        {error("threshold")}
      </div>

      <fieldset className="fieldset">
        <legend>Spending limit</legend>
        <div className="field">
          <label htmlFor="create-asset">Token</label>
          <input
            id="create-asset"
            value={values.asset}
            onChange={set("asset")}
            spellCheck={false}
            autoComplete="off"
            {...field("asset")}
          />
          <p className="hint">Starts as the network&rsquo;s XLM. Use another token&rsquo;s contract id if you prefer.</p>
          {error("asset")}
        </div>
        <div className="field">
          <label htmlFor="create-limit">Most that can be spent</label>
          <input
            id="create-limit"
            inputMode="decimal"
            value={values.limit}
            onChange={set("limit")}
            {...field("limit")}
          />
          {error("limit")}
        </div>
        <div className="field">
          <label htmlFor="create-period">Per how many days</label>
          <input
            id="create-period"
            inputMode="numeric"
            value={values.periodDays}
            onChange={set("periodDays")}
            {...field("periodDays")}
          />
          {error("periodDays")}
        </div>
        <p className="hint">The limit is fixed when the treasury is created. A token without a limit can&rsquo;t be spent.</p>
      </fieldset>

      {needsWallet ? <StatusMessage kind="info">Connect your wallet to create a treasury.</StatusMessage> : null}
      {!needsWallet && blockedReason ? <StatusMessage kind="error">{blockedReason}</StatusMessage> : null}
      {busy ? <StatusMessage kind="info">{progress}</StatusMessage> : null}
      {failure ? <StatusMessage kind="error">{failure}</StatusMessage> : null}

      <button type="submit" className="button" disabled={busy || needsWallet || Boolean(blockedReason)}>
        {busy ? "Creating…" : "Create treasury"}
      </button>
    </form>
  );
}
