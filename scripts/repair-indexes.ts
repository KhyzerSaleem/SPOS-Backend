/**
 * Diagnose and repair duplicate-key ("This record already exists") failures.
 *
 * Why this exists: Mongoose creates the indexes a schema declares but NEVER
 * drops ones it no longer declares, and it cannot change the options of an
 * existing index (MongoDB reports IndexOptionsConflict and keeps the old one).
 * So a unique index from an older schema version — for example a globally
 * unique `employeeId_1` or `email_1` that predates tenant scoping — survives
 * forever and keeps rejecting inserts no matter what the application code does.
 *
 * Run (from server/):
 *   npm run db:repair-indexes           apply fixes
 *   npm run db:repair-indexes -- --dry  report only, change nothing
 *
 * Env: DATABASE_URL (required)
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
// Named import: `import dns from 'dns'` resolves to undefined without
// esModuleInterop, which this project's tsconfig does not enable for scripts.
import { setServers } from 'dns';
import mongoose from 'mongoose';

/** `mongodb+srv://` needs a DNS SRV lookup, which some ISPs/VPNs/corporate
 *  resolvers refuse (querySrv ECONNREFUSED). Detect that specific failure so we
 *  can retry against public resolvers instead of just dying. */
function isSrvDnsFailure(err: any): boolean {
  const code = String(err?.code ?? '');
  return (
    err?.syscall === 'querySrv' ||
    ((code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'ETIMEOUT' ||
      code === 'EREFUSED' ||
      code === 'ESERVFAIL') &&
      String(err?.hostname ?? '').startsWith('_mongodb._tcp.'))
  );
}

const PUBLIC_DNS = ['8.8.8.8', '1.1.1.1', '9.9.9.9'];

async function connectWithDnsFallback(uri: string): Promise<void> {
  const opts = { serverSelectionTimeoutMS: 20000 } as any;
  try {
    await mongoose.connect(uri, opts);
    return;
  } catch (err: any) {
    if (!isSrvDnsFailure(err) || !uri.startsWith('mongodb+srv://')) throw err;

    console.warn(
      `\n⚠ SRV DNS lookup failed via the system resolver (${err.code}).` +
        `\n  Retrying with public DNS: ${PUBLIC_DNS.join(', ')}\n`,
    );
    try {
      await mongoose.disconnect();
    } catch {
      /* nothing to tear down */
    }
    setServers(PUBLIC_DNS);
    await mongoose.connect(uri, opts);
  }
}

function printConnectionHelp(err: any): void {
  console.error('\n✖ Could not connect to MongoDB.\n');
  if (isSrvDnsFailure(err)) {
    console.error(
      'The failure is a DNS SRV lookup, not the database itself. Your network\n' +
        'refused the "_mongodb._tcp..." query that mongodb+srv:// requires.\n\n' +
        'Any ONE of these will get you running:\n\n' +
        '  1. Use the non-SRV connection string (no SRV lookup needed).\n' +
        '     In Atlas: Connect → Drivers → "Node.js" version 2.2.12 or later\n' +
        '     gives a mongodb:// string listing all three hosts. Then run:\n' +
        '       npm run db:repair-indexes -- --uri="mongodb://user:pass@host1:27017,host2:27017,host3:27017/db?ssl=true&replicaSet=atlas-xxxx-shard-0&authSource=admin&retryWrites=true&w=majority"\n\n' +
        '  2. Switch your machine/router DNS to 8.8.8.8 or 1.1.1.1 and retry\n' +
        '     (this script already retries with those automatically, so if you\n' +
        '     still see this, DNS is blocked at the firewall).\n\n' +
        '  3. Disconnect from any VPN/proxy, or run the script from a network\n' +
        '     that allows outbound DNS (port 53).\n\n' +
        '  4. Run it where your backend already runs (e.g. the Render shell),\n' +
        '     which clearly resolves Atlas fine.\n\n' +
        '  5. Do it by hand in the Atlas UI: Collections → employees → Indexes,\n' +
        '     and drop any UNIQUE index on employeeId or email that does NOT\n' +
        '     include tenantId. Then restart the server to rebuild them.\n',
    );
  } else {
    console.error(
      'Check that DATABASE_URL is correct and that your IP is allowed in\n' +
        'Atlas → Network Access.\n',
    );
  }
}

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

interface ExpectedIndex {
  key: Record<string, 1 | -1>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

interface CollectionSpec {
  collection: string;
  /** Fields that must never be unique on their own (always tenant-scoped). */
  tenantScopedFields: string[];
  indexes: ExpectedIndex[];
}

const SPECS: CollectionSpec[] = [
  {
    collection: 'employees',
    tenantScopedFields: ['employeeId', 'email'],
    indexes: [
      { key: { tenantId: 1, employeeId: 1 }, unique: true },
      {
        key: { tenantId: 1, email: 1 },
        unique: true,
        partialFilterExpression: { email: { $type: 'string', $gt: '' } },
      },
      { key: { tenantId: 1, departmentId: 1 } },
      { key: { tenantId: 1, status: 1 } },
      { key: { tenantId: 1, storeId: 1 } },
    ],
  },
];

const sig = (key: Record<string, unknown>) =>
  Object.entries(key)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

const DRY = process.argv.includes('--dry');

/** --uri="mongodb://..." overrides DATABASE_URL (use the non-SRV string when
 *  your network blocks SRV DNS lookups). */
function uriFromArgs(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--uri'));
  if (!arg) return undefined;
  const eq = arg.indexOf('=');
  if (eq !== -1) return arg.slice(eq + 1).replace(/^["']|["']$/g, '');
  const idx = process.argv.indexOf(arg);
  return process.argv[idx + 1];
}

async function main() {
  loadEnv();
  const uri = uriFromArgs() || process.env.DATABASE_URL;
  if (!uri) {
    console.error('DATABASE_URL is not set in server/.env (or pass --uri="mongodb://...")');
    process.exit(1);
  }

  await connectWithDnsFallback(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  console.log(DRY ? '=== DRY RUN — no changes ===\n' : '=== REPAIRING INDEXES ===\n');

  for (const spec of SPECS) {
    console.log(`\n── ${spec.collection} ─────────────────────────────`);
    const col = db.collection(spec.collection);

    const existing = await col.indexes();
    const expectedBySig = new Map(spec.indexes.map((i) => [sig(i.key), i]));

    console.log('Existing indexes:');
    for (const idx of existing) {
      const flags = [idx.unique ? 'unique' : null, idx.partialFilterExpression ? 'partial' : null]
        .filter(Boolean)
        .join(' ');
      console.log(`  • ${idx.name}  {${sig(idx.key as any)}}${flags ? `  [${flags}]` : ''}`);
    }

    // ── 1. Legacy single-field unique indexes that ignore tenant scoping ──
    const toDrop: string[] = [];
    for (const idx of existing) {
      if (idx.name === '_id_') continue;
      const keys = Object.keys(idx.key as Record<string, unknown>);
      const isTenantScoped = keys.includes('tenantId');
      const touchesScopedField = keys.some((k) => spec.tenantScopedFields.includes(k));
      if (idx.unique && touchesScopedField && !isTenantScoped) {
        console.log(`\n  ⚠ LEGACY GLOBAL UNIQUE INDEX: "${idx.name}" on {${sig(idx.key as any)}}`);
        console.log('    This rejects values that are already used by a DIFFERENT tenant.');
        toDrop.push(idx.name as string);
      }
    }

    // ── 2. Right key, wrong options (e.g. non-partial where partial is wanted) ──
    for (const idx of existing) {
      if (idx.name === '_id_') continue;
      const expected = expectedBySig.get(sig(idx.key as any));
      if (!expected) continue;
      if (toDrop.includes(idx.name as string)) continue;

      const uniqueMismatch = Boolean(idx.unique) !== Boolean(expected.unique);
      const partialMismatch = !sameJson(
        idx.partialFilterExpression,
        expected.partialFilterExpression,
      );
      if (uniqueMismatch || partialMismatch) {
        console.log(`\n  ⚠ OPTIONS CONFLICT: "${idx.name}" on {${sig(idx.key as any)}}`);
        if (partialMismatch) {
          console.log(
            `    partialFilterExpression: have ${JSON.stringify(idx.partialFilterExpression ?? null)}` +
              `, want ${JSON.stringify(expected.partialFilterExpression ?? null)}`,
          );
        }
        if (uniqueMismatch) {
          console.log(`    unique: have ${Boolean(idx.unique)}, want ${Boolean(expected.unique)}`);
        }
        toDrop.push(idx.name as string);
      }
    }

    // ── 3. Duplicate data that would block each unique index ──
    for (const expected of spec.indexes) {
      if (!expected.unique) continue;
      const keys = Object.keys(expected.key);
      const groupId: Record<string, string> = {};
      for (const k of keys) groupId[k] = `$${k}`;

      const match: Record<string, unknown> = {};
      if (expected.partialFilterExpression) {
        Object.assign(match, expected.partialFilterExpression);
      }

      const dups = await col
        .aggregate([
          ...(Object.keys(match).length ? [{ $match: match }] : []),
          { $group: { _id: groupId, count: { $sum: 1 }, ids: { $push: '$_id' } } },
          { $match: { count: { $gt: 1 } } },
          { $limit: 25 },
        ])
        .toArray();

      if (dups.length) {
        console.log(
          `\n  ✖ DUPLICATE DATA blocking unique {${sig(expected.key)}} — ${dups.length} group(s):`,
        );
        for (const d of dups) {
          console.log(`    ${JSON.stringify(d._id)} × ${d.count}  ids=${d.ids.join(', ')}`);
        }
        console.log(
          '    Resolve these rows manually (delete or edit) before the unique index can be built.',
        );
      }
    }

    // ── 4. Normalise legacy email values on employees ──
    if (spec.collection === 'employees') {
      const badEmail = await col.countDocuments({
        $or: [{ email: 'undefined' }, { email: null }, { email: { $exists: false } }],
      });
      if (badEmail > 0) {
        console.log(`\n  ⚠ ${badEmail} employee(s) with a missing/"undefined" email.`);
        if (!DRY) {
          const r = await col.updateMany(
            { $or: [{ email: 'undefined' }, { email: null }, { email: { $exists: false } }] },
            { $set: { email: '' } },
          );
          console.log(`    → normalised ${r.modifiedCount} to an empty string.`);
        }
      }
    }

    // ── 5. Apply: drop offenders, then (re)create the expected set ──
    if (toDrop.length === 0) {
      console.log('\n  ✔ No offending indexes found.');
    } else if (DRY) {
      console.log(`\n  Would drop: ${toDrop.join(', ')}`);
    } else {
      for (const name of [...new Set(toDrop)]) {
        try {
          await col.dropIndex(name);
          console.log(`  → dropped "${name}"`);
        } catch (err: any) {
          console.log(`  → could not drop "${name}": ${err.message}`);
        }
      }
    }

    if (!DRY) {
      for (const expected of spec.indexes) {
        try {
          await col.createIndex(
            expected.key as any,
            {
              unique: expected.unique,
              ...(expected.partialFilterExpression
                ? { partialFilterExpression: expected.partialFilterExpression }
                : {}),
            } as any,
          );
        } catch (err: any) {
          console.log(`  → could not create {${sig(expected.key)}}: ${err.message}`);
        }
      }
      const after = await col.indexes();
      console.log('\n  Final indexes:');
      for (const idx of after) {
        const flags = [idx.unique ? 'unique' : null, idx.partialFilterExpression ? 'partial' : null]
          .filter(Boolean)
          .join(' ');
        console.log(`    • ${idx.name}  {${sig(idx.key as any)}}${flags ? `  [${flags}]` : ''}`);
      }
    }
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

main().catch((err) => {
  printConnectionHelp(err);
  console.error(err);
  process.exit(1);
});
