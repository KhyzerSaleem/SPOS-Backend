import { Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { TenantService } from './tenant.service';

@ApiTags('Stores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireFeature('settings')
@Controller('stores')
export class StoresController {
  constructor(private tenantService: TenantService) {}

  @Get()
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List all stores for current tenant' })
  async getStores(@Req() req: Request) {
    const user = req.user as any;
    return this.tenantService.getStoresFull(user.tenantId);
  }

  @Post()
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create a new store' })
  async createStore(@Req() req: Request, @Body() body: any) {
    const user = req.user as any;
    return this.tenantService.createStore(user.tenantId, body, {
      email: user.email,
      fullName: user.fullName,
    });
  }

  @Put(':id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update a store' })
  async updateStore(@Param('id') id: string, @Req() req: Request, @Body() body: any) {
    const user = req.user as any;
    return this.tenantService.updateStore(user.tenantId, id, body);
  }

  @Delete(':id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete a store' })
  async deleteStore(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.tenantService.deleteStore(user.tenantId, id);
  }
}
