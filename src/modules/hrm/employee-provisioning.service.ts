import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Role, RoleDocument, DEFAULT_ROLES_DATA } from '../../database/schemas/role.schema';
import { RefreshToken, RefreshTokenDocument } from '../../database/schemas/refresh-token.schema';
import { EmailService } from '../../common/services/email.service';
import { syncDefaultRolesForTenant } from '../../common/utils/role-seed.util';

@Injectable()
export class EmployeeProvisioningService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Store.name) private readonly storeModel: Model<StoreDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async getAssignableRoles(tenantId: string) {
    await syncDefaultRolesForTenant(this.roleModel, tenantId);

    const roles = await this.roleModel
      .find({ tenantId, isAssignable: true })
      .sort({ level: -1 })
      .select('name description level permissions isSystem')
      .lean();

    return roles.map((r) => {
      const perms = r.permissions ?? [];
      const fullAccess = perms.includes('*');
      return {
        name: r.name,
        description: r.description || '',
        level: r.level ?? 0,
        isSystem: r.isSystem ?? false,
        permissionCount: fullAccess ? null : perms.length,
        fullAccess,
        permissionPreview: fullAccess ? ['*'] : perms.slice(0, 8),
      };
    });
  }

  private async assertAssignableRole(tenantId: string, roleName: string): Promise<void> {
    const roleDoc = await this.roleModel
      .findOne({ tenantId, name: roleName, isAssignable: true })
      .lean();
    if (roleDoc) return;

    const fallback = DEFAULT_ROLES_DATA.find((r) => r.name === roleName && r.isAssignable);
    if (!fallback) {
      throw new BadRequestException(
        `Invalid role "${roleName}". Choose an assignable role from your organization.`,
      );
    }
  }

  /**
   * Creates a tenant user for an employee. Password is bcrypt-hashed in DB;
   * the temporary plain password is emailed once (never stored in plain text).
   */
  async provisionPortalAccount(params: {
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
    storeId?: string;
    invitedBy?: string;
    sendEmail?: boolean;
  }): Promise<{ userId: Types.ObjectId; tempPassword: string; emailed: boolean }> {
    const tenantId = params.tenantId;
    const email = params.email.toLowerCase().trim();
    const roleName = (params.role || 'employee').trim();

    await this.assertAssignableRole(tenantId, roleName);

    const existing = await this.userModel.findOne({ email, tenantId });
    if (existing) {
      throw new ConflictException('A portal user with this email already exists');
    }

    const tempPassword = crypto.randomBytes(6).toString('hex') + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    let storeAccess: Types.ObjectId[] = [];
    if (!params.storeId || !Types.ObjectId.isValid(params.storeId)) {
      throw new BadRequestException('A valid storeId is required for portal accounts');
    }
    const store = await this.storeModel.findOne({
      _id: params.storeId,
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    });
    if (!store) {
      throw new BadRequestException('Store not found or does not belong to your organization');
    }
    storeAccess = [store._id as Types.ObjectId];

    const user = await this.userModel.create({
      email,
      passwordHash,
      fullName: `${params.firstName} ${params.lastName}`.trim(),
      tenantId: new Types.ObjectId(tenantId),
      role: roleName,
      permissions: [], // access comes from tenant Role document, not per-user overrides
      storeAccess,
      isActive: true,
      emailVerified: true,
    });

    const tenant = await this.tenantModel.findById(tenantId).lean();
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    let emailed = false;

    if (params.sendEmail !== false) {
      await this.emailService.sendEmployeeCredentials(email, {
        employeeName: user.fullName,
        tenantName: tenant?.name || 'Your organization',
        role: roleName,
        email,
        tempPassword,
        loginUrl: `${frontendUrl}/login`,
        invitedBy: params.invitedBy || 'HR',
      });
      emailed = true;
    }

    return { userId: user._id as Types.ObjectId, tempPassword, emailed };
  }

  /** Updates portal RBAC role (and optional store access) for an existing linked user. */
  async updatePortalUserRole(params: {
    tenantId: string;
    userId: string;
    role: string;
    storeId?: string;
  }): Promise<void> {
    const tenantObjId = new Types.ObjectId(params.tenantId);
    const userObjId = new Types.ObjectId(params.userId);
    const roleName = (params.role || 'employee').trim();

    await this.assertAssignableRole(params.tenantId, roleName);

    const user = await this.userModel.findOne({ _id: userObjId, tenantId: tenantObjId });
    if (!user) {
      throw new BadRequestException('Linked portal user not found');
    }

    const update: Record<string, unknown> = { role: roleName, permissions: [] };

    if (params.storeId && Types.ObjectId.isValid(params.storeId)) {
      const store = await this.storeModel.findOne({
        _id: params.storeId,
        tenantId: tenantObjId,
        isActive: true,
      });
      if (!store) {
        throw new BadRequestException('Store not found or does not belong to your organization');
      }
      update.storeAccess = [store._id];
    }

    await this.userModel.updateOne(
      { _id: userObjId, tenantId: tenantObjId },
      { $set: update, $inc: { tokenVersion: 1 } },
    );
    await this.refreshTokenModel.deleteMany({ userId: userObjId });
  }
}
