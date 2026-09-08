import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { AttributeSetsService } from './attribute-sets.service';
import { CreateAttributeSetDto } from './dto/create-attribute-set.dto';

@ApiTags('Attribute Sets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('products')
@Controller('attribute-sets')
export class AttributeSetsController {
  constructor(private attrService: AttributeSetsService) {}

  @Get()
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'List attribute sets' })
  async findAll(@Req() req: Request) {
    const user = req.user as any;
    return this.attrService.findAll(user.tenantId);
  }

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create attribute set' })
  async create(@Req() req: Request, @Body() dto: CreateAttributeSetDto) {
    const user = req.user as any;
    return this.attrService.create(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update attribute set' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateAttributeSetDto) {
    const user = req.user as any;
    return this.attrService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Delete attribute set' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.attrService.delete(user.tenantId, id);
  }
}
