import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from './schemas/employee.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';

@Injectable()
export class EmployeePortalSyncService {
  private readonly logger = new Logger(EmployeePortalSyncService.name);

  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(Store.name) private readonly storeModel: Model<StoreDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Public helper for consistent EMP-xxx IDs across create + sync flows.
   *
   * `offset` skips ahead that many numbers. Retrying a duplicate-key insert with
   * offset = attempt guarantees each attempt tries a *different* id — without it
   * every retry regenerates the same number (max+1 is tenant-scoped), so a
   * legacy database index that is unique across tenants would fail all attempts.
   */
  async nextEmployeeIdForTenant(tenantId: string, offset = 0): Promise<string> {
    return this.nextEmployeeId(new Types.ObjectId(tenantId), offset);
  }

  /**
   * Next EMP-#### id for a tenant.
   *
   * Uses the highest existing EMP number across ALL of the tenant's employees —
   * not the most-recently-*created* row. The previous `sort({ createdAt: -1 })`
   * approach broke whenever createdAt order differed from id order (e.g. a bulk
   * import/migration that wrote rows with identical timestamps) or when the
   * newest row's id didn't match the `EMP-` pattern (nextNum then reset to 1),
   * regenerating an id that already existed and tripping the
   * (tenantId, employeeId) unique index — surfacing as "record already exists".
   *
   * Still generate-then-insert, so callers must handle a duplicate-key race
   * (see isEmployeeIdDuplicateError + the retry loop in HrmService.createEmployee).
   */
  private async nextEmployeeId(tenantId: Types.ObjectId, offset = 0): Promise<string> {
    const rows = await this.employeeModel
      .find({ tenantId, employeeId: { $regex: /^EMP-\d+$/ } })
      .select('employeeId')
      .lean<{ employeeId: string }[]>();

    let maxNum = 0;
    for (const row of rows) {
      const match = row.employeeId?.match(/^EMP-(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
    return `EMP-${String(maxNum + 1 + Math.max(0, offset)).padStart(3, '0')}`;
  }

  private splitName(fullName: string): { firstName: string; lastName: string } {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: 'Team', lastName: 'Member' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  /**
   * Ensures an HRM Employee row exists for a portal user (invite accept or legacy staff invite).
   */
  async ensureEmployeeForUser(params: {
    tenantId: string;
    userId: Types.ObjectId;
    email: string;
    fullName: string;
    storeAccess?: string[];
  }): Promise<EmployeeDocument | null> {
    const tenantOid = new Types.ObjectId(params.tenantId);
    const email = params.email.toLowerCase().trim();

    const existing = await this.employeeModel.findOne({ tenantId: tenantOid, email });
    if (existing) {
      if (!existing.userId) {
        await this.employeeModel.updateOne(
          { _id: existing._id },
          { $set: { userId: params.userId } },
        );
      }
      return existing;
    }

    let storeId: Types.ObjectId | undefined;
    const firstStore = params.storeAccess?.find((id) => Types.ObjectId.isValid(id));
    if (firstStore) {
      const store = await this.storeModel.findOne({
        _id: new Types.ObjectId(firstStore),
        tenantId: tenantOid,
        isActive: true,
      });
      if (store) storeId = store._id as Types.ObjectId;
    }
    if (!storeId) {
      const fallback = await this.storeModel
        .findOne({ tenantId: tenantOid, isActive: true })
        .sort({ createdAt: 1 });
      if (fallback) storeId = fallback._id as Types.ObjectId;
    }

    const { firstName, lastName } = this.splitName(params.fullName);
    const employeeId = await this.nextEmployeeId(tenantOid);

    const created = await this.employeeModel.create({
      employeeId,
      tenantId: tenantOid,
      userId: params.userId,
      email,
      firstName,
      lastName: lastName || firstName,
      status: 'active',
      employmentType: 'full-time',
      ...(storeId ? { storeId } : {}),
    });

    this.logger.log(
      `Synced portal user ${email} → employee ${employeeId} (tenant ${params.tenantId})`,
    );
    return created;
  }

  /** Backfill employees for portal users that were created before sync existed. */
  async syncAllPortalUsersForTenant(
    tenantId: string,
  ): Promise<{ created: number; linked: number }> {
    const tenantOid = new Types.ObjectId(tenantId);
    const users = await this.userModel
      .find({ tenantId: tenantOid, isActive: { $ne: false } })
      .select('email fullName storeAccess')
      .lean();

    let created = 0;
    let linked = 0;
    for (const u of users) {
      const before = await this.employeeModel.countDocuments({
        tenantId: tenantOid,
        email: String(u.email).toLowerCase(),
      });
      const emp = await this.ensureEmployeeForUser({
        tenantId,
        userId: u._id as Types.ObjectId,
        email: String(u.email),
        fullName: String(u.fullName || u.email),
        storeAccess: (u.storeAccess ?? []).map((id) => String(id)),
      });
      if (!emp) continue;
      if (before === 0) created++;
      else linked++;
    }
    return { created, linked };
  }
}
