/**
 * Shared helpers for rolling up money across currencies safely — used by any
 * report that must consolidate local-currency transactions into the tenant's
 * base currency (AR/AP aging, statements, and eventually dashboard/reports
 * hardening). Centralizing this avoids re-introducing the exact silent-fallback
 * bug identified in the codebase audit: naively falling back from a base amount
 * to the raw local amount treats e.g. PKR 100,000 as if it were $100,000.
 */

export interface CurrencyRollupInput {
  currency?: string | null;
  baseCurrency?: string | null;
  exchangeRateMissing?: boolean;
}

export interface SafeBaseAmountResult {
  /** The amount in base currency, safe to sum into a consolidated total. */
  amount: number;
  /** True when this record could NOT be safely converted and was excluded (amount is 0). */
  excluded: boolean;
}

/**
 * Resolves a local amount to a base-currency amount without ever silently
 * mistreating an unconverted or missing-rate record as already-converted.
 *
 * - No currency set, or currency === baseCurrency: the local amount IS the base
 *   amount (legacy single-currency data, or a same-currency store) — exact,
 *   no conversion needed.
 * - exchangeRateMissing: the record's base amount cannot be trusted yet
 *   (checkout allowed the sale without a rate). Excluded from totals — the
 *   caller should surface "N record(s) pending FX rate" rather than silently
 *   showing a wrong number.
 * - Otherwise: the precomputed base amount (converted at transaction time,
 *   or backfilled once a rate arrived) is used directly.
 */
export function safeBaseAmount(
  localAmount: number,
  baseAmount: number | null | undefined,
  doc: CurrencyRollupInput,
): SafeBaseAmountResult {
  const currency = doc.currency || null;
  const baseCurrency = doc.baseCurrency || null;

  if (!currency || !baseCurrency || currency === baseCurrency) {
    return { amount: Number(localAmount) || 0, excluded: false };
  }
  if (doc.exchangeRateMissing) {
    return { amount: 0, excluded: true };
  }
  return { amount: Number(baseAmount) || 0, excluded: false };
}

export type AgingBucketKey = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export const AGING_BUCKET_KEYS: AgingBucketKey[] = ['current', '1-30', '31-60', '61-90', '90+'];

/** Standard aging buckets by days overdue (<=0 = not yet due). */
export function agingBucketForDays(daysOverdue: number): AgingBucketKey {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

/** Whole days between a reference (due) date and `asOf` — positive when overdue. */
export function daysOverdue(dueDate: Date, asOf: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((asOf.getTime() - dueDate.getTime()) / msPerDay);
}
