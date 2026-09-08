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
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';

@ApiTags('Units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('products')
@Controller('units')
export class UnitsController {
  constructor(private unitsService: UnitsService) {}

  @Get()
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'List units' })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.unitsService.findAll(user.tenantId, query);
  }

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create unit' })
  async create(@Req() req: Request, @Body() dto: CreateUnitDto) {
    const user = req.user as any;
    return this.unitsService.create(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update unit' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateUnitDto) {
    const user = req.user as any;
    return this.unitsService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Delete unit' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.unitsService.delete(user.tenantId, id);
  }
}
