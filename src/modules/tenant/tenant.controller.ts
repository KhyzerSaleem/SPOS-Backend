import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { TenantService } from './tenant.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireFeature('settings')
@Controller('tenant')
export class TenantController {
  constructor(private tenantService: TenantService) {}

  // ── Business profile (Settings → Business) ──
  @Get()
  @ApiOperation({ summary: 'Get tenant business profile (name, logo, contact)' })
  @ApiResponse({ status: 200, description: 'Business profile' })
  async getBusiness(@Req() req: Request) {
    const user = req.user as any;
    return this.tenantService.getBusinessProfile(user.tenantId);
  }

  @Put()
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update tenant business profile' })
  @ApiResponse({ status: 200, description: 'Business profile updated' })
  async updateBusiness(@Req() req: Request, @Body() dto: UpdateBusinessDto) {
    const user = req.user as any;
    return this.tenantService.updateBusinessProfile(user.tenantId, dto);
  }

  @Get('locale')
  @ApiOperation({ summary: 'Get tenant default UI language' })
  @ApiResponse({ status: 200, description: 'Default locale code' })
  async getLocale(@Req() req: Request) {
    const user = req.user as any;
    return this.tenantService.getLocale(user.tenantId);
  }

  @Put('locale')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Set tenant default UI language for all users' })
  @ApiResponse({ status: 200, description: 'Default locale updated' })
  async updateLocale(@Req() req: Request, @Body() dto: UpdateLocaleDto) {
    const user = req.user as any;
    return this.tenantService.updateLocale(user.tenantId, dto.locale);
  }

  @Get('stores')
  @SkipSubscription()
  @ApiOperation({ summary: 'List stores assigned to the current user (for dashboard, POS, etc.)' })
  @ApiResponse({ status: 200, description: 'List of stores' })
  async getStores(@Req() req: Request) {
    const user = req.user as any;
    return this.tenantService.getStoresForUser(user.tenantId, user);
  }

  @Post('stores')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create a store for the current tenant' })
  async createStore(@Req() req: Request, @Body() body: CreateStoreDto) {
    const user = req.user as any;
    return this.tenantService.createStore(user.tenantId, body, {
      email: user.email,
      fullName: user.fullName,
    });
  }

  @Put('stores/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update a store' })
  async updateStore(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateStoreDto) {
    const user = req.user as any;
    return this.tenantService.updateStore(user.tenantId, id, body);
  }

  @Delete('stores/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete a store' })
  async deleteStore(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.tenantService.deleteStore(user.tenantId, id);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile with stores' })
  @ApiResponse({ status: 200, description: 'User profile with stores' })
  async getProfile(@Req() req: Request) {
    const user = req.user as any;
    return this.tenantService.getProfile(user.sub, user.tenantId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const user = req.user as any;
    return this.tenantService.updateProfile(user.sub, dto);
  }
}
