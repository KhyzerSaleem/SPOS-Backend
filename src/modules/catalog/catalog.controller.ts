import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { CatalogService } from './catalog.service';

@ApiTags('Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('products')
@Controller('catalog')
export class CatalogController {
  constructor(private svc: CatalogService) {}

  @Get('products')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'List tenant catalog products' })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.svc.findAll(user.tenantId, query);
  }

  @Get('products/:id')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get catalog product with store listings' })
  async findOne(@Req() req: Request, @Param('id') id: string): Promise<any> {
    const user = req.user as any;
    return this.svc.findOne(user.tenantId, id);
  }

  @Post('products')
  @RequirePermissions('products.create')
  @ApiOperation({ summary: 'Create tenant catalog product' })
  async create(@Req() req: Request, @Body() body: any) {
    const user = req.user as any;
    return this.svc.create(user.tenantId, body);
  }

  @Put('products/:id')
  @RequirePermissions('products.update')
  @ApiOperation({ summary: 'Update catalog product' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = req.user as any;
    return this.svc.update(user.tenantId, id, body);
  }

  @Delete('products/:id')
  @RequirePermissions('products.delete')
  @ApiOperation({ summary: 'Delete catalog product' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.svc.remove(user.tenantId, id);
  }

  @Post('products/:id/publish')
  @RequirePermissions('products.update')
  @ApiOperation({ summary: 'Publish catalog product to stores' })
  async publish(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = req.user as any;
    return this.svc.publishToStores(user.tenantId, id, body);
  }
}
