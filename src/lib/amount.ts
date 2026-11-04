import { ASSET_DECIMALS } from "./config";

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

/**
 * Turn what a person typed ("12.5") into the smallest unit (125000000n).
 * Allows up to `decimals` decimal places. Throws {@link AmountError} with a message fit for the screen.
 */
export function parseAmount(input: string, decimals = ASSET_DECIMALS): bigint {
  const text = input.trim();
  if (text === "") throw new AmountError("Enter an amount.");
  if (!/^\d+(\.\d+)?$/.test(text)) throw new AmountError("Use numbers only, for example 12.5.");
  const [whole = "0", fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new AmountError(`Use at most ${decimals} decimal places.`);
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (value <= 0n) throw new AmountError("The amount must be greater than zero.");
  return value;
}

/** Turn the smallest unit into text: 125000000n becomes "12.5". */
export function formatAmount(value: bigint, decimals = ASSET_DECIMALS): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? "." + fraction : ""}`;
}

/** `GABCD...WXYZ` for display. */
export function shortAddress(address: string, edge = 4): string {
  if (address.length <= edge * 2 + 3) return address;
  return `${address.slice(0, edge)}…${address.slice(-edge)}`;
}

/** Length of time left in words: "2 days", "5 hours", "10 minutes". */
export function timeLeft(expiresAt: bigint, nowSeconds: number): string {
  const seconds = Number(expiresAt) - nowSeconds;
  if (seconds <= 0) return "expired";
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds >= 86400) return plural(Math.floor(seconds / 86400), "day");
  if (seconds >= 3600) return plural(Math.floor(seconds / 3600), "hour");
  return plural(Math.max(1, Math.floor(seconds / 60)), "minute");
}
