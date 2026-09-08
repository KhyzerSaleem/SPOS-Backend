/**
 * Wipes auth/tenant data and seeds a fresh demo tenant + owner + super-admin.
 * Run: npm run db:reset (from server/)
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import mongoose, { Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ROLES_DATA } from '../src/database/schemas/role.schema';

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

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'owner@swiftpos.local';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD;
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? 'admin@swiftpos.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

const BASIC_FEATURES = [
  'pos',
  'products',
  'inventory',
  'sales',
  'customers',
  'settings',
  'reports',
];

async function main() {
  loadEnv();
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('DATABASE_URL is not set in server/.env');
    process.exit(1);
  }
  if (!OWNER_PASSWORD || !ADMIN_PASSWORD) {
    console.error(
      'Set SEED_OWNER_PASSWORD and SEED_ADMIN_PASSWORD in server/.env before running db:reset.',
    );
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  const collectionsToClear = [
    'users',
    'refreshtokens',
    'otps',
    'invites',
    'roles',
    'stores',
    'tenants',
    'subscriptions',
    'billinginvoices',
    'plans',
  ];

  for (const name of collectionsToClear) {
    try {
      const result = await db.collection(name).deleteMany({});
      console.log(`  Cleared ${name}: ${result.deletedCount} document(s)`);
    } catch {
      console.log(`  Skipped ${name} (collection may not exist)`);
    }
  }

  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const tenant = await db.collection('tenants').insertOne({
    name: 'Demo Store',
    subdomain: 'demo-store',
    plan: 'basic',
    isActive: true,
    featureAccess: BASIC_FEATURES,
    subscriptionStartDate: now,
    subscriptionEndDate: trialEnd,
    maxUsers: 10,
    maxStores: 5,
    createdAt: now,
    updatedAt: now,
  });

  const tenantId = tenant.insertedId;

  const store = await db.collection('stores').insertOne({
    name: 'Main Store',
    code: 'MAIN',
    address: '',
    tenantId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const roles = DEFAULT_ROLES_DATA.map((r) => ({
    ...r,
    tenantId,
    createdAt: now,
    updatedAt: now,
  }));
  await db.collection('roles').insertMany(roles);

  await db.collection('plans').insertMany([
    {
      name: 'Trial',
      price: 0,
      features: ['pos', 'inventory', 'reports'],
      userLimit: 5,
      storeLimit: 2,
      storageLimitMB: 500,
      isActive: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'Professional',
      price: 49,
      features: ['pos', 'inventory', 'reports', 'hrm', 'finance'],
      userLimit: 25,
      storeLimit: 10,
      storageLimitMB: 5000,
      isActive: true,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'Enterprise',
      price: 149,
      features: ['*'],
      userLimit: 100,
      storeLimit: 50,
      storageLimitMB: 50000,
      isActive: true,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.collection('subscriptions').insertOne({
    tenantId,
    planId: new Types.ObjectId(),
    planName: 'Trial',
    price: 0,
    status: 'trial',
    billingCycle: 'monthly',
    startDate: now,
    renewalDate: trialEnd,
    trialEndsAt: trialEnd,
    autoRenew: false,
    createdAt: now,
    updatedAt: now,
  });

  const ownerHash = await bcrypt.hash(OWNER_PASSWORD, 12);
  await db.collection('users').insertOne({
    email: OWNER_EMAIL.toLowerCase(),
    passwordHash: ownerHash,
    fullName: 'Demo Owner',
    tenantId,
    role: 'owner',
    permissions: [],
    storeAccess: [store.insertedId],
    isActive: true,
    emailVerified: true,
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  });

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await db.collection('users').insertOne({
    email: ADMIN_EMAIL.toLowerCase(),
    passwordHash: adminHash,
    fullName: 'Super Admin',
    tenantId: null,
    role: 'super_admin',
    permissions: [],
    storeAccess: [],
    isActive: true,
    emailVerified: true,
    failedLoginAttempts: 0,
    lockUntil: null,
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  });

  console.log('\nDatabase reset complete.\n');
  console.log('Tenant owner (POS dashboard):');
  console.log(`  Email:    ${OWNER_EMAIL}`);
  console.log('\nSuper admin (/admin):');
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(
    '\nPasswords were set from SEED_OWNER_PASSWORD and SEED_ADMIN_PASSWORD in server/.env',
  );
  console.log('Restart the API server, then log in at http://localhost:3000/login\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
