import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { getPlanLimits, normalizePlanTier } from '../constants/plan-features';

@Injectable()
export class PlanLimitsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
  ) {}

  private async getTenantLimits(tenantId: string) {
    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }
    const tier = normalizePlanTier(tenant.plan);
    const fromPlan = getPlanLimits(tier);
    return {
      tier,
      maxUsers: tenant.maxUsers ?? fromPlan.maxUsers,
      maxStores: tenant.maxStores ?? fromPlan.maxStores,
      maxStorageMB: tenant.maxStorageMB ?? fromPlan.maxStorageMB,
    };
  }

  async assertCanAddStore(tenantId: string): Promise<void> {
    const limits = await this.getTenantLimits(tenantId);
    const storesUsed = await this.storeModel.countDocuments({ tenantId, isActive: true });
    if (storesUsed >= limits.maxStores) {
      throw new ForbiddenException({
        message: `Store limit reached (${storesUsed}/${limits.maxStores}). Upgrade your plan to add more stores.`,
        code: 'PLAN_LIMIT_STORES',
        used: storesUsed,
        limit: limits.maxStores,
        upgradeHint: 'Visit Billing to upgrade your subscription.',
      });
    }
  }

  async assertCanAddUser(tenantId: string): Promise<void> {
    const limits = await this.getTenantLimits(tenantId);
    const usersUsed = await this.userModel.countDocuments({ tenantId, isActive: true });
    if (usersUsed >= limits.maxUsers) {
      throw new ForbiddenException({
        message: `User limit reached (${usersUsed}/${limits.maxUsers}). Upgrade your plan to invite more team members.`,
        code: 'PLAN_LIMIT_USERS',
        used: usersUsed,
        limit: limits.maxUsers,
        upgradeHint: 'Visit Billing to upgrade your subscription.',
      });
    }
  }

  async getUsageSnapshot(tenantId: string) {
    const limits = await this.getTenantLimits(tenantId);
    const [usersUsed, storesUsed] = await Promise.all([
      this.userModel.countDocuments({ tenantId, isActive: true }),
      this.storeModel.countDocuments({ tenantId, isActive: true }),
    ]);
    return { ...limits, usersUsed, storesUsed };
  }
}
