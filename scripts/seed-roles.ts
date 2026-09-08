import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DEFAULT_ROLES_DATA } from '../src/database/schemas/role.schema';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/swiftpos';

async function seedRoles() {
  console.log(`Connecting to database at ${DATABASE_URL}...`);
  await mongoose.connect(DATABASE_URL);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection failed: db is undefined');
  }

  const tenants = await db.collection('tenants').find().toArray();
  if (tenants.length === 0) {
    console.log('No tenants found in the database. Please run npm run db:reset first.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${tenants.length} tenant(s). Syncing default roles...`);

  const now = new Date();
  for (const tenant of tenants) {
    console.log(`\nProcessing tenant: "${tenant.name}" (${tenant._id})`);
    let addedCount = 0;
    let existingCount = 0;

    for (const roleDef of DEFAULT_ROLES_DATA) {
      const existing = await db.collection('roles').findOne({
        tenantId: tenant._id,
        name: roleDef.name,
      });

      if (existing) {
        // Ensure properties and permissions are up to date
        await db.collection('roles').updateOne(
          { _id: existing._id },
          {
            $set: {
              description: roleDef.description,
              isSystem: roleDef.isSystem,
              isAssignable: roleDef.isAssignable,
              level: roleDef.level,
              updatedAt: now,
            },
            $setOnInsert: {
              permissions: roleDef.permissions,
            },
          },
        );
        existingCount++;
        console.log(
          `  ✓ Role "${roleDef.name}" already exists (${existing.permissions?.length || 0} permissions)`,
        );
      } else {
        await db.collection('roles').insertOne({
          name: roleDef.name,
          description: roleDef.description,
          permissions: roleDef.permissions,
          isSystem: roleDef.isSystem,
          isAssignable: roleDef.isAssignable,
          level: roleDef.level,
          tenantId: tenant._id,
          createdAt: now,
          updatedAt: now,
        });
        addedCount++;
        console.log(
          `  + Inserted new role "${roleDef.name}" (${roleDef.permissions.length} permissions)`,
        );
      }
    }

    const totalTenantRoles = await db.collection('roles').countDocuments({ tenantId: tenant._id });
    console.log(
      `Summary for tenant "${tenant.name}": ${existingCount} verified, ${addedCount} added. Total roles in DB: ${totalTenantRoles}`,
    );
  }

  const grandTotal = await db.collection('roles').countDocuments();
  console.log(
    `\nAll roles synced successfully. Total roles across all tenants in database: ${grandTotal}`,
  );

  await mongoose.disconnect();
}

seedRoles().catch((err) => {
  console.error('Error seeding roles:', err);
  process.exit(1);
});
