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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  @RequirePermissions('suppliers.view')
  @ApiOperation({ summary: 'List suppliers' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.suppliersService.findAll(user.tenantId, store.id, query);
  }

  @Get(':id')
  @RequirePermissions('suppliers.view')
  @ApiOperation({ summary: 'Get supplier' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.suppliersService.findOne(user.tenantId, store.id, id);
  }

  @Post()
  @RequirePermissions('suppliers.create')
  @ApiOperation({ summary: 'Create supplier' })
  async create(@Req() req: Request, @Body() body: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.suppliersService.create(user.tenantId, store.id, body);
  }

  @Put(':id')
  @RequirePermissions('suppliers.edit')
  @ApiOperation({ summary: 'Update supplier' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.suppliersService.update(user.tenantId, store.id, id, body);
  }

  @Delete(':id')
  @RequirePermissions('suppliers.delete')
  @ApiOperation({ summary: 'Delete supplier' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.suppliersService.delete(user.tenantId, store.id, id);
  }
}
