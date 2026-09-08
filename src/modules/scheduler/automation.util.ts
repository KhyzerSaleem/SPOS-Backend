/** Whole calendar days from today (UTC midnight) until the target date. */
export function calendarDaysUntil(targetDate: Date): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setUTCHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** Whole calendar days since a past date (UTC midnight). */
export function calendarDaysSince(pastDate: Date): number {
  return -calendarDaysUntil(pastDate);
}

/** Returns the first matching threshold from a sorted list, or undefined. */
export function matchingThreshold<T extends number>(
  value: number,
  thresholds: readonly T[],
): T | undefined {
  return thresholds.find((t) => t === value);
}

export function isAutomationEnabled(): boolean {
  const flag = process.env.AUTOMATION_ENABLED?.trim().toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  return process.env.NODE_ENV !== 'test';
}

export function heldOrderMaxAgeDays(): number {
  const raw = Number(process.env.HELD_ORDER_MAX_AGE_DAYS ?? 7);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 7;
}

export function softDeleteRetentionDays(): number {
  const raw = Number(process.env.SOFT_DELETE_RETENTION_DAYS ?? 90);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
}

export function planLimitWarningThreshold(): number {
  const raw = Number(process.env.PLAN_LIMIT_WARNING_PERCENT ?? 80);
  return Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : 80;
}
