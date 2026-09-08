import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
  Role,
  RoleDocument,
  SYSTEM_ROLES,
  PERMISSION_CATEGORIES,
  ALL_PERMISSIONS,
} from '../../database/schemas/role.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { RefreshToken, RefreshTokenDocument } from '../../database/schemas/refresh-token.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface RoleResponse {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  tenantId: string;
  isSystem: boolean;
  isAssignable: boolean;
  level: number;
  userCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name) private refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Guard against Mongoose cast errors from invalid ObjectId strings. */
  private assertValidId(id: string, label = 'ID'): void {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ${label}: "${id}"`);
    }
  }

  /** Map a Mongoose role document to the standard response shape. */
  private toResponse(role: RoleDocument | Record<string, any>, userCount?: number): RoleResponse {
    return {
      _id: role._id.toString(),
      name: role.name,
      description: role.description ?? '',
      permissions: role.permissions ?? [],
      tenantId: role.tenantId.toString(),
      isSystem: role.isSystem,
      isAssignable: role.isAssignable,
      level: role.level,
      ...(userCount !== undefined && { userCount }),
      createdAt: (role as any).createdAt, // lean() objects still contain these timestamps
      updatedAt: (role as any).updatedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Permissions catalogue
  // ---------------------------------------------------------------------------

  /** Returns every valid permission string grouped by category. */
  getAllPermissions(): Record<string, readonly string[]> {
    return PERMISSION_CATEGORIES;
  }

  // ---------------------------------------------------------------------------
  // Role CRUD
  // ---------------------------------------------------------------------------

  async getRoles(tenantId: string): Promise<RoleResponse[]> {
    await this.syncDefaultRolesForTenant(tenantId);

    const roles = await this.roleModel.find({ tenantId }).sort({ level: -1, createdAt: 1 }).lean();

    // Fetch all user-role counts for this tenant in one query
    const counts: { _id: string; count: number }[] = await this.userModel.aggregate([
      { $match: { tenantId: roles[0]?.tenantId } }, // same tenantId ObjectId
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);

    const countMap = new Map(counts.map((c) => [c._id, c.count]));

    return roles.map((role) => this.toResponse(role, countMap.get(role.name) ?? 0));
  }

  async getRoleById(tenantId: string, roleId: string): Promise<RoleResponse> {
    this.assertValidId(roleId, 'role ID');
    const role = await this.roleModel.findOne({ _id: roleId, tenantId }).lean();
    if (!role) throw new NotFoundException('Role not found');
    return this.toResponse(role);
  }

  async getRoleByName(tenantId: string, name: string): Promise<RoleDocument | null> {
    return this.roleModel.findOne({ tenantId, name });
  }

  async createRole(tenantId: string, dto: CreateRoleDto): Promise<RoleResponse> {
    // Block reserved names
    if (SYSTEM_ROLES.includes(dto.name as any)) {
      throw new BadRequestException(
        `"${dto.name}" is a reserved system role name. Please choose a different name.`,
      );
    }

    const existing = await this.roleModel.findOne({ tenantId, name: dto.name }).lean();
    if (existing) {
      throw new ConflictException(`Role "${dto.name}" already exists for this tenant`);
    }

    // Validate that all supplied permissions actually exist
    const invalidPerms = (dto.permissions ?? []).filter(
      (p) => !(ALL_PERMISSIONS as readonly string[]).includes(p),
    );
    if (invalidPerms.length > 0) {
      throw new BadRequestException(`Unknown permission(s): ${invalidPerms.join(', ')}`);
    }

    const role = await this.roleModel.create({
      name: dto.name,
      description: dto.description ?? '',
      permissions: dto.permissions ?? [],
      tenantId,
      isSystem: false,
      isAssignable: true,
      level: dto.level ?? 50,
    });

    return this.toResponse(role);
  }

  async updateRole(tenantId: string, roleId: string, dto: UpdateRoleDto): Promise<RoleResponse> {
    this.assertValidId(roleId, 'role ID');
    const role = await this.roleModel.findOne({ _id: roleId, tenantId });
    if (!role) throw new NotFoundException('Role not found');
    const previousName = role.name;

    // System roles: only permissions may be updated; structure is locked
    if (role.isSystem) {
      if (dto.name !== undefined && dto.name !== role.name) {
        throw new BadRequestException('Cannot rename system roles');
      }
      if (dto.isAssignable !== undefined) {
        throw new BadRequestException('Cannot change assignability of system roles');
      }
      if (dto.level !== undefined) {
        throw new BadRequestException('Cannot change the level of system roles');
      }
    }

    // Name change — check for collision first
    if (dto.name !== undefined && dto.name !== role.name) {
      const clash = await this.roleModel.findOne({ tenantId, name: dto.name }).lean();
      if (clash) throw new ConflictException(`Role "${dto.name}" already exists`);
      role.name = dto.name;
    }

    if (dto.description !== undefined) role.description = dto.description;

    if (dto.permissions !== undefined) {
      const invalidPerms = dto.permissions.filter(
        (p) => !(ALL_PERMISSIONS as readonly string[]).includes(p) && p !== '*',
      );
      if (invalidPerms.length > 0) {
        throw new BadRequestException(`Unknown permission(s): ${invalidPerms.join(', ')}`);
      }
      role.permissions = dto.permissions;
    }

    if (dto.isAssignable !== undefined && !role.isSystem) role.isAssignable = dto.isAssignable;
    if (dto.level !== undefined && !role.isSystem) role.level = dto.level;

    const permissionsChanged = dto.permissions !== undefined;
    const nameChanged = dto.name !== undefined && dto.name !== previousName;

    await role.save();

    if (permissionsChanged || nameChanged) {
      const matchRole = nameChanged ? previousName : role.name;
      await this.userModel.updateMany(
        { tenantId, role: matchRole },
        {
          ...(nameChanged ? { $set: { role: role.name } } : {}),
          $inc: { tokenVersion: 1 },
        },
      );
      const affected = await this.userModel
        .find({ tenantId, role: role.name })
        .select('_id')
        .lean();
      const ids = affected.map((u) => u._id);
      if (ids.length > 0) {
        await this.refreshTokenModel.deleteMany({ userId: { $in: ids } });
      }
    }

    return this.toResponse(role);
  }

  async deleteRole(tenantId: string, roleId: string): Promise<{ message: string }> {
    this.assertValidId(roleId, 'role ID');
    const role = await this.roleModel.findOne({ _id: roleId, tenantId });
    if (!role) throw new NotFoundException('Role not found');

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    const userCount = await this.userModel.countDocuments({ tenantId, role: role.name });
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete role "${role.name}" — ${userCount} user(s) currently hold this role. Reassign them first.`,
      );
    }

    await this.roleModel.deleteOne({ _id: roleId, tenantId });
    return { message: `Role "${role.name}" deleted successfully` };
  }

  // ---------------------------------------------------------------------------
  // Users by role
  // ---------------------------------------------------------------------------

  async getUsersByRole(
    tenantId: string,
    roleName: string,
  ): Promise<{ _id: string; email: string; fullName: string; isActive: boolean }[]> {
    const users = await this.userModel
      .find({ tenantId, role: roleName }, { _id: 1, email: 1, fullName: 1, isActive: 1 })
      .lean();

    return users.map((u) => ({
      _id: u._id.toString(),
      email: u.email,
      fullName: u.fullName,
      isActive: u.isActive,
    }));
  }

  // ---------------------------------------------------------------------------
  // Role assignment
  // ---------------------------------------------------------------------------

  async assignRoleToUser(
    tenantId: string,
    userId: string,
    roleName: string,
    permissionOverrides: string[] | undefined,
    assignerRole: string,
  ): Promise<{ message: string }> {
    this.assertValidId(userId, 'user ID');

    if (roleName === 'owner') {
      throw new BadRequestException('The owner role cannot be assigned through this endpoint');
    }

    const role = await this.roleModel.findOne({ tenantId, name: roleName }).lean();
    if (!role) throw new NotFoundException(`Role "${roleName}" not found`);
    if (!role.isAssignable) {
      throw new BadRequestException(`Role "${roleName}" cannot be assigned to users`);
    }

    const assignerRoleDoc = await this.roleModel.findOne({ tenantId, name: assignerRole }).lean();
    if (assignerRole !== 'owner' && assignerRole !== 'super_admin') {
      const assignerLevel = assignerRoleDoc?.level ?? 0;
      if (role.level > assignerLevel) {
        throw new ForbiddenException(
          `You cannot assign a role with higher authority than your own (${assignerRole})`,
        );
      }
    }

    const user = await this.userModel.findOne({ _id: userId, tenantId });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'owner') {
      throw new BadRequestException('Cannot change the role of the tenant owner');
    }

    // Validate any permission overrides before persisting
    if (permissionOverrides && permissionOverrides.length > 0) {
      const invalid = permissionOverrides.filter(
        (p) => !(ALL_PERMISSIONS as readonly string[]).includes(p),
      );
      if (invalid.length > 0) {
        throw new BadRequestException(`Unknown permission override(s): ${invalid.join(', ')}`);
      }
      user.permissions = permissionOverrides;
    }

    user.role = roleName;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    await this.refreshTokenModel.deleteMany({ userId: user._id });

    return { message: `User assigned to role "${roleName}" successfully` };
  }

  // ---------------------------------------------------------------------------
  // Sync — called from AuthService on boot
  // ---------------------------------------------------------------------------

  /**
   * Upserts all DEFAULT_ROLES_DATA entries for a single tenant.
   * Safe to call repeatedly — never duplicates or overwrites custom roles.
   */
  async syncDefaultRolesForTenant(tenantId: string): Promise<void> {
    const { syncDefaultRolesForTenant: sync } = await import('../../common/utils/role-seed.util');
    await sync(this.roleModel, tenantId);
  }
}
