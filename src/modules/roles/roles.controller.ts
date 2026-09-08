import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireFeature('settings')
@Controller('roles') // global prefix 'api' is set in main.ts — do not repeat it here
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * GET /api/roles/permissions
   * Returns every valid permission string grouped by category.
   * Requires settings.view — prevents any authenticated user from enumerating permissions.
   *
   * IMPORTANT: must be declared before GET :id to avoid Express matching
   * 'permissions' as a Mongo ObjectId param.
   */
  @Get('permissions')
  @ApiOperation({ summary: 'Get all available permission strings grouped by category' })
  @RequirePermissions('settings.view')
  getAllPermissions() {
    return this.rolesService.getAllPermissions();
  }

  /**
   * GET /api/roles/users/:roleName
   * Must be declared before GET :id for the same route-ordering reason.
   */
  @Get('users/:roleName')
  @ApiOperation({ summary: 'Get all users assigned to a specific role' })
  @RequirePermissions('settings.view')
  getUsersByRole(@Req() req: any, @Param('roleName') roleName: string) {
    return this.rolesService.getUsersByRole(req.user.tenantId, roleName);
  }

  // ---------------------------------------------------------------------------
  // Role CRUD
  // ---------------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'List all roles for the current tenant' })
  @RequirePermissions('settings.view')
  getRoles(@Req() req: any) {
    return this.rolesService.getRoles(req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single role by ID' })
  @RequirePermissions('settings.view')
  getRoleById(@Req() req: any, @Param('id') id: string) {
    return this.rolesService.getRoleById(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new custom role' })
  @RequirePermissions('settings.manage')
  createRole(@Req() req: any, @Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a role (partial)' })
  @RequirePermissions('settings.manage')
  updateRole(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a custom role (system roles cannot be deleted)' })
  @RequirePermissions('settings.manage')
  deleteRole(@Req() req: any, @Param('id') id: string) {
    return this.rolesService.deleteRole(req.user.tenantId, id);
  }

  // ---------------------------------------------------------------------------
  // Role assignment
  // ---------------------------------------------------------------------------

  /**
   * PATCH /api/roles/assign/:userId
   * Assigns a role (and optional permission overrides) to a user.
   * Body: { role: string; permissions?: string[] }
   */
  @Patch('assign/:userId')
  @ApiOperation({ summary: 'Assign a role to a user' })
  @RequirePermissions('settings.manage')
  assignRoleToUser(@Req() req: any, @Param('userId') userId: string, @Body() dto: AssignRoleDto) {
    return this.rolesService.assignRoleToUser(
      req.user.tenantId,
      userId,
      dto.role,
      dto.permissions,
      req.user.role,
    );
  }
}
