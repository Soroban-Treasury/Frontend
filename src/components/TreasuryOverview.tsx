import { formatAmount, shortAddress } from "@/lib/amount";
import { assetLabel } from "@/lib/treasury";
import type { LimitView } from "@/lib/useTreasuryData";

function period(seconds: bigint): string {
  const days = Number(seconds) / 86400;
  if (Number.isInteger(days) && days >= 1) return days === 1 ? "day" : `${days} days`;
  const hours = Number(seconds) / 3600;
  if (Number.isInteger(hours) && hours >= 1) return hours === 1 ? "hour" : `${hours} hours`;
  return `${seconds} seconds`;
}

export function TreasuryOverview({
  owners,
  threshold,
  limits,
  address,
}: {
  owners: string[];
  threshold: number;
  limits: LimitView[];
  address: string | null;
}) {
  return (
    <section className="card" aria-labelledby="overview-heading">
      <h2 id="overview-heading">Overview</h2>
      <p>
        <strong>{threshold}</strong> of <strong>{owners.length}</strong> owners must approve each payment.
      </p>

      <h3>Owners</h3>
      <ul className="plain-list">
        {owners.map((o) => (
          <li key={o}>
            <span title={o}>{shortAddress(o, 6)}</span>
            {o === address ? <span className="you"> (you)</span> : null}
          </li>
        ))}
      </ul>

      <h3>Spending limits</h3>
      {limits.length === 0 ? (
        <p className="empty">No limits are set, so nothing can be spent.</p>
      ) : (
        <ul className="plain-list">
          {limits.map((l) => (
            <li key={l.asset}>
              {formatAmount(l.limit)} {assetLabel(l.asset)} per {period(l.period)}.{" "}
              <span className="muted">
                {formatAmount(l.spent)} {assetLabel(l.asset)} spent so far in this period.
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
