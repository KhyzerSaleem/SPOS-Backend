/**
 * One-time migration: convert legacy self-signup tenants from `basic` (or missing
 * Subscription docs) to the trial plan model.
 *
 * Targets tenants that were created via self-signup and never paid:
 *   - plan is basic/free/starter AND no paid subscription (no Stripe/PayPal IDs, price 0)
 *   - OR no Subscription document but tenant.subscriptionEndDate is set
 *
 * Action: set tenant plan to `trial`, sync featureAccess/limits, and create (or
 * update) a trial Subscription using remaining days from subscriptionEndDate.
 *
 * Run: npm run migrate:trial
 * Dry-run: npm run migrate:trial -- --dry-run
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import mongoose, { Types } from 'mongoose';
import { buildTenantPlanUpdate } from '../src/common/constants/plan-features';

function loadEnv(): void {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const LEGACY_BASIC_PLANS = new Set(['basic', 'free', 'starter']);

interface SubscriptionDoc {
  _id?: Types.ObjectId;
  tenantId: Types.ObjectId;
  status?: string;
  price?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  paypalSubscriptionId?: string;
  trialEndsAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TenantDoc {
  _id: Types.ObjectId;
  name: string;
  plan?: string;
  subscriptionEndDate?: Date | null;
  subscriptionStartDate?: Date;
  featureAccess?: string[];
}

function isPaidSubscription(sub: SubscriptionDoc | null): boolean {
  if (!sub) return false;
  if (sub.stripeSubscriptionId || sub.stripeCustomerId || sub.paypalSubscriptionId) return true;
  if (sub.status === 'active' && (sub.price ?? 0) > 0) return true;
  return false;
}

function isLegacySelfSignupTenant(tenant: TenantDoc, sub: SubscriptionDoc | null): boolean {
  if (isPaidSubscription(sub)) return false;

  const plan = (tenant.plan || 'basic').toLowerCase();
  const hasEndDate = !!tenant.subscriptionEndDate;

  if (!sub && hasEndDate) return true;

  if (LEGACY_BASIC_PLANS.has(plan) && hasEndDate && !isPaidSubscription(sub)) {
    return true;
  }

  return false;
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('DATABASE_URL is not set in server/.env');
    process.exit(1);
  }

  console.log(dryRun ? 'DRY RUN — no writes\n' : 'LIVE RUN — applying changes\n');
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  const tenantsCol = db.collection<TenantDoc>('tenants');
  const subsCol = db.collection<SubscriptionDoc>('subscriptions');

  const tenants = await tenantsCol.find({}).toArray();
  let candidates = 0;
  let migrated = 0;
  let skippedPaid = 0;
  let skippedAlreadyTrial = 0;

  for (const tenant of tenants) {
    const sub = await subsCol.findOne({ tenantId: tenant._id });

    if (tenant.plan === 'trial' && sub?.status === 'trial') {
      skippedAlreadyTrial++;
      continue;
    }

    if (!isLegacySelfSignupTenant(tenant, sub)) {
      if (isPaidSubscription(sub)) skippedPaid++;
      continue;
    }

    candidates++;
    const endDate = tenant.subscriptionEndDate
      ? new Date(tenant.subscriptionEndDate)
      : new Date(Date.now() + 14 * 86_400_000);
    const now = new Date();
    const remainingMs = endDate.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / 86_400_000));

    console.log(
      `  [${dryRun ? 'would migrate' : 'migrate'}] ${tenant.name} (${tenant._id}) — ` +
        `${remainingDays} day(s) remaining until ${endDate.toISOString().slice(0, 10)}`,
    );

    if (dryRun) {
      migrated++;
      continue;
    }

    const planUpdate = buildTenantPlanUpdate('trial');
    await tenantsCol.updateOne(
      { _id: tenant._id },
      {
        $set: {
          ...planUpdate,
          subscriptionEndDate: endDate,
          subscriptionStartDate: tenant.subscriptionStartDate ?? now,
          updatedAt: now,
        },
      },
    );

    const subPayload = {
      tenantId: tenant._id,
      planName: 'Trial',
      price: 0,
      status: 'trial',
      billingCycle: 'monthly',
      startDate: tenant.subscriptionStartDate ?? now,
      renewalDate: endDate,
      trialEndsAt: endDate,
      subscriptionEndDate: endDate,
      autoRenew: false,
      trialExpiryNotificationsSent: [] as number[],
      updatedAt: now,
    };

    if (sub) {
      await subsCol.updateOne({ _id: sub._id }, { $set: subPayload });
    } else {
      await subsCol.insertOne({ ...subPayload, createdAt: now });
    }

    migrated++;
  }

  console.log('\nMigration summary:');
  console.log(`  Candidates:           ${candidates}`);
  console.log(`  ${dryRun ? 'Would migrate' : 'Migrated'}:          ${migrated}`);
  console.log(`  Skipped (paid):       ${skippedPaid}`);
  console.log(`  Skipped (already trial): ${skippedAlreadyTrial}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
