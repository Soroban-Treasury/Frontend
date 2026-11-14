"use client";

import { StrKey } from "@stellar/stellar-sdk";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Proposal } from "treasury-sdk";
import { AmountError, formatAmount, parseAmount } from "@/lib/amount";
import { errorMessage } from "@/lib/treasury";
import { StatusMessage } from "./StatusMessage";

export interface AssetOption {
  id: string;
  label: string;
  /** Most that can be spent per period (`null` or `0n` when this asset has no spending limit). */
  limit: bigint | null;
  /** Left to spend in the current period (shorthand when `spent` is omitted). */
  remaining?: bigint;
  /** Amount already spent in the active period (`getSpent` from the SDK). */
  spent?: bigint;
  /** Period length in seconds (`getSpendLimit(asset).period` from the SDK). */
  periodSeconds?: bigint;
  /** Unix timestamp (seconds) when the recorded spending period started on-chain. */
  periodStart?: number | null;
  /** Explicit Unix timestamp (seconds) when the active period resets. */
  resetsAt?: number | null;
  /** Total amount of approved, unpaid proposals for this asset (added to `proposals` if given). */
  approvedUnpaid?: bigint;
}

export interface ProposalInput {
  asset: string;
  to: string;
  amount: bigint;
  ttlSeconds: number;
}

export type SdkPreviewOutcome =
  | { ok: true; fee?: bigint }
  | { ok: false; message: string };

interface Props {
  assets: AssetOption[];
  /** The signed-in account can only propose if it is an owner. */
  canPropose: boolean;
  /** Why it can't, shown to the person. */
  reason?: string;
  /** Open proposals so approved-but-unpaid amounts are counted against what is left. */
  proposals?: Proposal[] | null;
  /** Approval threshold used to identify approved unpaid proposals. */
  threshold?: number;
  /** Reference Unix timestamp in seconds (defaults to current clock). */
  nowSeconds?: number;
  /** Optional SDK write-call preview hook (`treasury.preview.propose`) when available. */
  onPreview?: (input: ProposalInput) => Promise<SdkPreviewOutcome | null>;
  onSubmit: (input: ProposalInput) => Promise<void>;
}

export interface PolicyEvaluation {
  hasLimit: boolean;
  limit: bigint;
  spent: bigint;
  approvedUnpaid: bigint;
  available: bigint;
  periodReset: boolean;
  resetLabel: string;
  untilDate: string;
  verdictKind: "neutral" | "fits" | "over";
  verdict: string;
}

const UTC_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
  timeZoneName: "short",
});

export function formatResetDate(unixSeconds: number): string {
  return UTC_DATE_FORMAT.format(new Date(unixSeconds * 1000));
}

function formatPeriodWindow(seconds: bigint): string {
  const days = Number(seconds) / 86400;
  if (Number.isInteger(days) && days >= 1) return days === 1 ? "1 day" : `${days} days`;
  const hours = Number(seconds) / 3600;
  if (Number.isInteger(hours) && hours >= 1) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${seconds} seconds`;
}

/**
 * Evaluate a payment draft against an asset's spending limit, current period spend,
 * approved-but-unpaid proposals, and period reset timestamp.
 */
export function evaluateSpendingPolicy(
  asset: AssetOption,
  typedAmount: bigint | null,
  options: { proposals?: Proposal[] | null; threshold?: number; nowSeconds?: number } = {},
): PolicyEvaluation {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (asset.limit === null || asset.limit <= 0n) {
    return {
      hasLimit: false,
      limit: 0n,
      spent: 0n,
      approvedUnpaid: 0n,
      available: 0n,
      periodReset: false,
      resetLabel: "No limit configured",
      untilDate: "a limit is set",
      verdictKind: "over",
      verdict: `${asset.label} has no spending limit, so it cannot be spent.`,
    };
  }

  const limit = asset.limit;
  const rawResetAt =
    asset.resetsAt !== undefined
      ? asset.resetsAt
      : asset.periodStart != null && asset.periodSeconds && asset.periodSeconds > 0n
        ? asset.periodStart + Number(asset.periodSeconds)
        : null;

  const periodReset = rawResetAt !== null && now >= rawResetAt;

  const rawSpent =
    asset.spent !== undefined
      ? asset.spent
      : asset.remaining !== undefined && limit > asset.remaining
        ? limit - asset.remaining
        : 0n;
  const spent = periodReset ? 0n : rawSpent;

  const requiredApprovals = Math.max(1, options.threshold ?? 1);
  const fromProposals = (options.proposals ?? []).reduce((sum, p) => {
    if (
      p.asset === asset.id &&
      !p.executed &&
      p.expiresAt >= BigInt(now) &&
      p.approvals.length >= requiredApprovals
    ) {
      return sum + p.amount;
    }
    return sum;
  }, 0n);
  const approvedUnpaid = (asset.approvedUnpaid ?? 0n) + fromProposals;

  const committed = spent + approvedUnpaid;
  const available = limit > committed ? limit - committed : 0n;

  const fallbackResetSeconds =
    asset.periodSeconds && asset.periodSeconds > 0n ? now + Number(asset.periodSeconds) : null;

  let resetLabel: string;
  let untilDate: string;
  if (rawResetAt !== null && !periodReset) {
    untilDate = formatResetDate(rawResetAt);
    resetLabel = untilDate;
  } else if (periodReset) {
    untilDate = fallbackResetSeconds !== null ? formatResetDate(fallbackResetSeconds) : "the next period reset";
    resetLabel = asset.periodSeconds
      ? `Period has reset (new ${formatPeriodWindow(asset.periodSeconds)} window on next payment)`
      : "Period has reset";
  } else if (asset.periodSeconds && asset.periodSeconds > 0n) {
    untilDate = formatResetDate(now + Number(asset.periodSeconds));
    resetLabel =
      spent > 0n
        ? `By ${untilDate}`
        : `New ${formatPeriodWindow(asset.periodSeconds)} window starts on next payment`;
  } else {
    untilDate = "the current period resets";
    resetLabel = "Current period";
  }

  if (typedAmount === null) {
    return {
      hasLimit: true,
      limit,
      spent,
      approvedUnpaid,
      available,
      periodReset,
      resetLabel,
      untilDate,
      verdictKind: "neutral",
      verdict: periodReset
        ? `Previous spending period has reset. ${formatAmount(available)} ${asset.label} is available.`
        : `Enter an amount to preview it against ${formatAmount(available)} ${asset.label} available.`,
    };
  }

  if (typedAmount > available) {
    const overBy = typedAmount - available;
    return {
      hasLimit: true,
      limit,
      spent,
      approvedUnpaid,
      available,
      periodReset,
      resetLabel,
      untilDate,
      verdictKind: "over",
      verdict: `This is ${formatAmount(overBy)} ${asset.label} over what is left until ${untilDate}.`,
    };
  }

  const leftAfter = available - typedAmount;
  const verdict =
    leftAfter === 0n
      ? `Fits the spending limit: uses all ${formatAmount(available)} ${asset.label} available (0 ${asset.label} remaining).`
      : `Fits the spending limit: ${formatAmount(leftAfter)} ${asset.label} will remain after this payment.`;

  return {
    hasLimit: true,
    limit,
    spent,
    approvedUnpaid,
    available,
    periodReset,
    resetLabel,
    untilDate,
    verdictKind: "fits",
    verdict,
  };
}

export function ProposalForm({
  assets,
  canPropose,
  reason,
  proposals,
  threshold,
  nowSeconds,
  onPreview,
  onSubmit,
}: Props) {
  const [asset, setAsset] = useState(assets[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("7");
  const [errors, setErrors] = useState<{ to?: string; amount?: string; days?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sdkPreview, setSdkPreview] = useState<SdkPreviewOutcome | null>(null);

  const selected = assets.find((a) => a.id === (asset || assets[0]?.id));

  const parsedDraftAmount = useMemo((): bigint | null => {
    try {
      return parseAmount(amount);
    } catch {
      return null;
    }
  }, [amount]);

  const policy = useMemo(
    () =>
      selected
        ? evaluateSpendingPolicy(selected, parsedDraftAmount, { proposals, threshold, nowSeconds })
        : null,
    [selected, parsedDraftAmount, proposals, threshold, nowSeconds],
  );

  useEffect(() => {
    if (!onPreview || !selected || !policy?.hasLimit || parsedDraftAmount === null) {
      setSdkPreview(null);
      return;
    }
    const recipient = to.trim();
    const d = Number(days);
    const validRecipient = StrKey.isValidEd25519PublicKey(recipient) || StrKey.isValidContract(recipient);
    if (!validRecipient || !Number.isInteger(d) || d < 1 || d > 30) {
      setSdkPreview(null);
      return;
    }
    let cancelled = false;
    void onPreview({
      asset: selected.id,
      to: recipient,
      amount: parsedDraftAmount,
      ttlSeconds: d * 86400,
    })
      .then((outcome) => {
        if (!cancelled) setSdkPreview(outcome);
      })
      .catch(() => {
        if (!cancelled) setSdkPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [onPreview, selected, policy?.hasLimit, parsedDraftAmount, to, days]);

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
    if (selected && (selected.limit === null || selected.limit <= 0n)) {
      next.amount = `${selected.label} has no spending limit, so it cannot be spent.`;
    } else {
      try {
        value = parseAmount(amount);
        if (selected?.limit && value > selected.limit) {
          next.amount = `That is above the spending limit of ${formatAmount(selected.limit)} ${selected.label}.`;
        }
      } catch (e) {
        next.amount = e instanceof AmountError ? e.message : "Enter a valid amount.";
      }
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

  const verdictText =
    sdkPreview && !sdkPreview.ok
      ? `${policy?.verdict ?? ""} Contract preview: ${sdkPreview.message}`.trim()
      : sdkPreview && sdkPreview.ok && sdkPreview.fee !== undefined && policy?.verdictKind === "fits"
        ? `${policy.verdict} Estimated network fee: ${formatAmount(sdkPreview.fee)} XLM.`
        : (policy?.verdict ?? "");

  const verdictTone = sdkPreview && !sdkPreview.ok ? "over" : (policy?.verdictKind ?? "neutral");

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
        {selected && policy?.hasLimit ? (
          <p className="hint">
            {formatAmount(policy.available)} {selected.label} left to spend in this period (limit{" "}
            {formatAmount(policy.limit)}).
          </p>
        ) : null}
        {errors.amount ? (
          <p id="propose-amount-error" className="field-error">
            {errors.amount}
          </p>
        ) : null}

        {selected && policy ? (
          <div className="policy-simulator" aria-label="Spending limit preview">
            {policy.hasLimit ? (
              <dl className="policy-breakdown">
                <div>
                  <dt>Period limit</dt>
                  <dd>
                    {formatAmount(policy.limit)} {selected.label}
                  </dd>
                </div>
                <div>
                  <dt>Spent this period</dt>
                  <dd>
                    {formatAmount(policy.spent)} {selected.label}
                  </dd>
                </div>
                <div>
                  <dt>Approved (not paid yet)</dt>
                  <dd>
                    {formatAmount(policy.approvedUnpaid)} {selected.label}
                  </dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>
                    {formatAmount(policy.available)} {selected.label}
                  </dd>
                </div>
                <div>
                  <dt>Period resets</dt>
                  <dd>{policy.resetLabel}</dd>
                </div>
              </dl>
            ) : null}
            <p role="status" className={`policy-verdict policy-verdict-${verdictTone}`}>
              {verdictText}
            </p>
          </div>
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

      <button type="submit" className="button" disabled={busy || !canPropose || (policy !== null && !policy.hasLimit)}>
        {busy ? "Sending…" : "Propose payment"}
      </button>
    </form>
  );
}
