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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('products')
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'List categories' })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.categoriesService.findAll(user.tenantId, query);
  }

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create category' })
  async create(@Req() req: Request, @Body() dto: CreateCategoryDto) {
    const user = req.user as any;
    return this.categoriesService.create(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update category' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateCategoryDto) {
    const user = req.user as any;
    return this.categoriesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Delete category' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.categoriesService.delete(user.tenantId, id, user.sub);
  }

  @Post(':id/restore')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Restore soft-deleted category' })
  async restore(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.categoriesService.restore(user.tenantId, id);
  }
}
