import { Model } from 'mongoose';
import { SubscriptionDocument } from '../../database/schemas/subscription.schema';

const BILLING_RECOVERY_ROLES = new Set(['owner', 'manager', 'admin']);

/** Subscription states where owners must still sign in and reach billing. */
export function subscriptionNeedsBillingRecovery(
  sub: {
    status?: string;
    trialEndsAt?: Date | null;
  } | null,
): boolean {
  if (!sub) return false;
  if (sub.status === 'suspended' || sub.status === 'overdue' || sub.status === 'cancelled') {
    return true;
  }
  if (sub.status === 'trial') {
    const expiry = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    return Boolean(expiry && expiry < new Date());
  }
  return false;
}

/**
 * Inactive users are normally blocked, but owners/admins on expired or suspended
 * subscriptions must authenticate to complete checkout.
 */
export async function allowsBillingRecoveryAuth(
  subscriptionModel: Model<SubscriptionDocument>,
  user: { isActive?: boolean; tenantId?: unknown; role?: string },
): Promise<boolean> {
  if (user.isActive !== false) return true;
  if (!user.tenantId || !BILLING_RECOVERY_ROLES.has(user.role || '')) return false;

  const sub = await subscriptionModel
    .findOne({ tenantId: user.tenantId })
    .select('status trialEndsAt')
    .lean<{ status?: string; trialEndsAt?: Date | null }>();

  return subscriptionNeedsBillingRecovery(sub);
}
