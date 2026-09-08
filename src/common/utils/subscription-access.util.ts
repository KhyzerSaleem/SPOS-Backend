import { normalizePlanTier } from '../constants/plan-features';

export const TRIAL_PERIOD_DAYS = 14;

export function resolveTrialEndDate(
  sub?: {
    trialEndsAt?: Date | null;
    subscriptionEndDate?: Date | null;
    renewalDate?: Date | null;
  } | null,
  tenant?: { subscriptionEndDate?: Date | null } | null,
): Date | null {
  const candidates = [
    sub?.trialEndsAt,
    sub?.renewalDate,
    sub?.subscriptionEndDate,
    tenant?.subscriptionEndDate,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function isTrialWindowActive(
  sub?: {
    status?: string;
    trialEndsAt?: Date | null;
    subscriptionEndDate?: Date | null;
    renewalDate?: Date | null;
  } | null,
  tenant?: { plan?: string; subscriptionEndDate?: Date | null } | null,
  now = new Date(),
): boolean {
  if (normalizePlanTier(tenant?.plan) !== 'trial') return false;
  const end = resolveTrialEndDate(sub, tenant);
  if (!end) return false;
  return end > now;
}

/** Repair mistaken suspension while trial window is still open. */
export function shouldRepairTrialStatus(
  sub?: {
    status?: string;
    trialEndsAt?: Date | null;
    subscriptionEndDate?: Date | null;
    renewalDate?: Date | null;
  } | null,
  tenant?: { plan?: string; subscriptionEndDate?: Date | null } | null,
  now = new Date(),
): boolean {
  if (!sub) return false;
  if (!['suspended', 'overdue', 'cancelled'].includes(sub.status || '')) return false;
  return isTrialWindowActive(sub, tenant, now);
}
