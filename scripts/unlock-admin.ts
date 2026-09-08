/**
 * Clears login lockout for a user (super-admin recovery).
 * Run: npm run db:unlock-admin (from server/)
 *
 * Env: DATABASE_URL (required)
 *      ADMIN_EMAIL or SEED_ADMIN_EMAIL — email to unlock (default admin@swiftpos.local)
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';

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

const TARGET_EMAIL = (
  process.env.ADMIN_EMAIL ||
  process.env.SEED_ADMIN_EMAIL ||
  'admin@swiftpos.local'
).toLowerCase();

async function main() {
  loadEnv();
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('DATABASE_URL is not set in server/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  const result = await db
    .collection('users')
    .updateOne(
      { email: TARGET_EMAIL },
      { $set: { failedLoginAttempts: 0, lockUntil: null, updatedAt: new Date() } },
    );

  if (result.matchedCount === 0) {
    console.error(`No user found with email: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  console.log(`Unlocked account: ${TARGET_EMAIL}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
