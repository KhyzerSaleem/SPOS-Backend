import { Model, Types } from 'mongoose';
import { RoleDocument, DEFAULT_ROLES_DATA } from '../../database/schemas/role.schema';

/**
 * Ensures every default system role exists for a tenant (upsert).
 * Owners configure permissions in Settings → Roles; HRM only assigns role names.
 */
export async function syncDefaultRolesForTenant(
  roleModel: Model<RoleDocument>,
  tenantId: string | Types.ObjectId,
): Promise<void> {
  const tid = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;
  for (const roleDef of DEFAULT_ROLES_DATA) {
    await roleModel.updateOne(
      { name: roleDef.name, tenantId: tid },
      {
        $set: {
          description: roleDef.description,
          isSystem: roleDef.isSystem,
          isAssignable: roleDef.isAssignable,
          level: roleDef.level,
        },
        $setOnInsert: { permissions: roleDef.permissions },
      },
      { upsert: true },
    );
  }
}
