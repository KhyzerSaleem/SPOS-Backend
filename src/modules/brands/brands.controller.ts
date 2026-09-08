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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';

@ApiTags('Brands')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('products')
@Controller('brands')
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

  @Get()
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'List brands' })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.brandsService.findAll(user.tenantId, query);
  }

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create brand' })
  async create(@Req() req: Request, @Body() dto: CreateBrandDto) {
    const user = req.user as any;
    return this.brandsService.create(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update brand' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateBrandDto) {
    const user = req.user as any;
    return this.brandsService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Delete brand' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.brandsService.delete(user.tenantId, id);
  }
}
