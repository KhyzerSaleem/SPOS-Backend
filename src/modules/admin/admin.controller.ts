import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { PlatformPermissionGuard } from '../../common/guards/platform-permission.guard';
import { RequirePlatformPermissions } from '../../common/decorators/require-platform-permissions.decorator';
import { AdminService } from './admin.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { AdminPlanListItem } from './types/admin-plan.types';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { PlatformSettings } from '../../database/schemas/platform-settings.schema';
import { AutomationRunnerService } from '../scheduler/automation-runner.service';
import {
  BulkSetPlanDto,
  BulkSetUserStatusDto,
  BulkDeleteTenantsDto,
  DeleteTenantDto,
  IdsBodyDto,
  SetTenantPlanDto,
  SetUserStatusDto,
} from './dto/admin-bulk.dto';
import { CreatePlanDto, UpdatePlanDto } from './dto/create-plan.dto';
import { CreatePlatformTeamMemberDto, UpdatePlatformTeamMemberDto } from './dto/platform-team.dto';
import { assertValidObjectId } from '../../common/utils/mongo-id.util';

type AdminRequest = Request & {
  user?: { sub: string; email: string; role: string; effectivePermissions?: string[] };
};

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard, PlatformPermissionGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private platformSettings: PlatformSettingsService,
    private automationRunner: AutomationRunnerService,
  ) {}

  // ── Stats ──

  @Get('stats')
  @RequirePlatformPermissions('admin.dashboard')
  @ApiOperation({ summary: 'Get admin dashboard stats' })
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('search')
  @RequirePlatformPermissions('admin.dashboard')
  @ApiOperation({ summary: 'Global search across tenants, users, and support tickets' })
  @ApiQuery({ name: 'q', required: true })
  async globalSearch(@Query('q') q: string | undefined, @Req() req: AdminRequest) {
    return this.adminService.globalSearch(q, req.user);
  }

  @Get('billing/overview')
  @RequirePlatformPermissions('admin.billing.view')
  @ApiOperation({ summary: 'Platform billing oversight (invoices, renewals, failures)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getBillingOverview(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getBillingOverview(Number(page) || 1, Number(limit) || 20);
  }

  // ── Platform settings (CMS + maintenance) ──

  @Get('platform-settings')
  @RequirePlatformPermissions('admin.system.manage')
  @ApiOperation({ summary: 'Get platform-wide settings (CMS, maintenance, SEO)' })
  async getPlatformSettings() {
    const doc = await this.platformSettings.getSettings();
    return doc.toObject();
  }

  @Put('platform-settings')
  @RequirePlatformPermissions('admin.system.manage')
  @ApiOperation({ summary: 'Update platform-wide settings' })
  async updatePlatformSettings(@Body() body: UpdatePlatformSettingsDto) {
    const doc = await this.platformSettings.updateSettings(body as Partial<PlatformSettings>);
    return doc.toObject();
  }

  // ── Tenants ──

  @Get('tenants')
  @RequirePlatformPermissions('admin.tenants.view')
  @ApiOperation({ summary: 'List all tenants (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'plan', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'active | suspended' })
  async getTenants(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('plan') plan?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getTenants(
      Number(page) || 1,
      Number(limit) || 15,
      search,
      plan,
      status,
    );
  }

  @Get('tenants/:id')
  @RequirePlatformPermissions('admin.tenants.view')
  @ApiOperation({ summary: 'Get a single tenant (with owner + counts)' })
  async getTenant(@Param('id') id: string) {
    return this.adminService.getTenant(id);
  }

  @Post('tenants')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Create tenant + owner user' })
  async createTenant(@Body() body: CreateTenantDto, @Req() req: AdminRequest) {
    return this.adminService.createTenant(body, req.user);
  }

  @Put('tenants/:id')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Update a tenant' })
  async updateTenant(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminService.updateTenant(id, body, req.user);
  }

  @Patch('tenants/:id/suspend')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Suspend a tenant' })
  async suspendTenant(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.adminService.suspendTenant(id, req.user);
  }

  @Patch('tenants/:id/activate')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Activate a tenant' })
  async activateTenant(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.adminService.activateTenant(id, req.user);
  }

  @Delete('tenants/:id')
  @RequirePlatformPermissions('admin.tenants.delete')
  @ApiOperation({ summary: 'Delete a tenant and all related data' })
  async deleteTenant(
    @Param('id') id: string,
    @Body() body: DeleteTenantDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminService.deleteTenant(id, req.user, body);
  }

  @Post('tenants/:id/login-as')
  @RequirePlatformPermissions('admin.tenants.impersonate')
  @ApiOperation({ summary: 'Login as tenant owner (impersonate)' })
  async loginAsTenant(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.adminService.loginAsTenant(id, req.user);
  }

  @Patch('tenants/:id/plan')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Set tenant subscription plan tier (trial, basic, pro, enterprise)' })
  async setTenantPlan(
    @Param('id') id: string,
    @Body() body: SetTenantPlanDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminService.setTenantPlan(id, body.plan, req.user);
  }

  @Patch('tenants/:id/feature-access')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Deprecated — use PATCH tenants/:id/plan' })
  async setFeatureAccess(@Param('id') id: string, @Body() body: { featureAccess: string[] }) {
    return this.adminService.setFeatureAccess(id, body.featureAccess);
  }

  @Post('tenants/bulk/suspend')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Bulk suspend tenants' })
  async bulkSuspendTenants(@Body() body: IdsBodyDto, @Req() req: AdminRequest) {
    return this.adminService.bulkSuspendTenants(body.ids, req.user);
  }

  @Post('tenants/bulk/activate')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Bulk activate tenants' })
  async bulkActivateTenants(@Body() body: IdsBodyDto, @Req() req: AdminRequest) {
    return this.adminService.bulkActivateTenants(body.ids, req.user);
  }

  @Post('tenants/bulk/delete')
  @RequirePlatformPermissions('admin.tenants.delete')
  @ApiOperation({ summary: 'Bulk delete tenants and related data' })
  async bulkDeleteTenants(@Body() body: BulkDeleteTenantsDto, @Req() req: AdminRequest) {
    return this.adminService.bulkDeleteTenants(body.ids, req.user, body);
  }

  @Post('tenants/bulk/plan')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Bulk set tenant plan tier' })
  async bulkSetTenantPlan(@Body() body: BulkSetPlanDto, @Req() req: AdminRequest) {
    return this.adminService.bulkSetTenantPlan(body.ids, body.plan, req.user);
  }

  @Post('tenants/bulk/feature-access')
  @RequirePlatformPermissions('admin.tenants.manage')
  @ApiOperation({ summary: 'Deprecated — use POST tenants/bulk/plan' })
  async bulkSetFeatureAccess(@Body() body: { ids: string[]; featureAccess: string[] }) {
    return this.adminService.bulkSetFeatureAccess(body.ids, body.featureAccess);
  }

  @Get('plan-tiers')
  @RequirePlatformPermissions('admin.plans.view')
  @ApiOperation({ summary: 'Named plan tiers with fixed feature bundles' })
  async getPlanTiers() {
    return this.adminService.getPlanTiers();
  }

  // ── Plans ──

  @Get('plans')
  @RequirePlatformPermissions('admin.plans.view')
  @ApiOperation({ summary: 'List all subscription plans' })
  async getPlans(): Promise<AdminPlanListItem[]> {
    return this.adminService.getPlans();
  }

  @Post('plans')
  @RequirePlatformPermissions('admin.plans.manage')
  @ApiOperation({ summary: 'Create a new plan' })
  async createPlan(@Body() body: CreatePlanDto, @Req() req: AdminRequest) {
    return this.adminService.createPlan(body, req.user);
  }

  @Put('plans/:id')
  @RequirePlatformPermissions('admin.plans.manage')
  @ApiOperation({ summary: 'Update a plan' })
  async updatePlan(@Param('id') id: string, @Body() body: UpdatePlanDto, @Req() req: AdminRequest) {
    assertValidObjectId(id, 'plan ID');
    return this.adminService.updatePlan(id, body, req.user);
  }

  @Delete('plans/:id')
  @RequirePlatformPermissions('admin.plans.manage')
  @ApiOperation({ summary: 'Delete a plan' })
  async deletePlan(@Param('id') id: string, @Req() req: AdminRequest) {
    assertValidObjectId(id, 'plan ID');
    return this.adminService.deletePlan(id, req.user);
  }

  // ── Global Users ──

  @Get('users')
  @RequirePlatformPermissions('admin.users.view')
  @ApiOperation({ summary: 'List all users across tenants (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false })
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.getUsers(Number(page) || 1, Number(limit) || 20, search, role);
  }

  @Patch('users/:id/status')
  @RequirePlatformPermissions('admin.users.manage')
  @ApiOperation({ summary: 'Activate or deactivate a user' })
  async setUserStatus(
    @Param('id') id: string,
    @Body() body: SetUserStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminService.setUserStatus(id, body.isActive, req.user);
  }

  @Post('users/:id/reset-password')
  @RequirePlatformPermissions('admin.users.reset_password')
  @ApiOperation({ summary: 'Reset user password to a temporary one' })
  async resetUserPassword(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.adminService.resetUserPassword(id, req.user);
  }

  @Patch('users/:id/unlock')
  @RequirePlatformPermissions('admin.users.manage')
  @ApiOperation({ summary: 'Clear login lockout for a user' })
  async unlockUser(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.adminService.unlockUser(id, req.user);
  }

  @Post('users/bulk/status')
  @RequirePlatformPermissions('admin.users.manage')
  @ApiOperation({ summary: 'Bulk activate or deactivate users' })
  async bulkSetUserStatus(@Body() body: BulkSetUserStatusDto, @Req() req: AdminRequest) {
    return this.adminService.bulkSetUserStatus(body.ids, body.isActive, req.user);
  }

  @Post('users/bulk/reset-password')
  @RequirePlatformPermissions('admin.users.reset_password')
  @ApiOperation({ summary: 'Bulk reset passwords (returns temporary passwords)' })
  async bulkResetUserPasswords(@Body() body: IdsBodyDto, @Req() req: AdminRequest) {
    return this.adminService.bulkResetUserPasswords(body.ids, req.user);
  }

  @Get('activity-logs')
  @RequirePlatformPermissions('admin.dashboard')
  @ApiOperation({ summary: 'Recent platform activity (tenants + users)' })
  @ApiQuery({ name: 'limit', required: false })
  async getActivityLogs(@Query('limit') limit?: string) {
    return this.adminService.getActivityLogs(Number(limit) || 25);
  }

  @Get('automations')
  @RequirePlatformPermissions('admin.system.manage')
  @ApiOperation({ summary: 'Scheduled automation jobs and last run status' })
  async getAutomations() {
    const jobs = await this.automationRunner.listJobStatuses();
    return {
      enabled: process.env.AUTOMATION_ENABLED !== 'false' && process.env.NODE_ENV !== 'test',
      jobs,
    };
  }

  // ── Platform team (internal HRM / operators) ──

  @Get('platform-team')
  @RequirePlatformPermissions('admin.team.view')
  @ApiOperation({ summary: 'List SwiftPOS platform team members' })
  async getPlatformTeam() {
    return this.adminService.getPlatformTeam();
  }

  @Post('platform-team')
  @RequirePlatformPermissions('admin.team.manage')
  @ApiOperation({ summary: 'Create platform team member' })
  async createPlatformTeamMember(
    @Body() body: CreatePlatformTeamMemberDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminService.createPlatformTeamMember(body, req.user);
  }

  @Put('platform-team/:id')
  @RequirePlatformPermissions('admin.team.manage')
  @ApiOperation({ summary: 'Update platform team member' })
  async updatePlatformTeamMember(
    @Param('id') id: string,
    @Body() body: UpdatePlatformTeamMemberDto,
    @Req() req: AdminRequest,
  ) {
    assertValidObjectId(id, 'platform team member ID');
    return this.adminService.updatePlatformTeamMember(id, body, req.user);
  }
}
