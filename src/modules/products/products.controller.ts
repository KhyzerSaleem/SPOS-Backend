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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('products')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'List products with pagination and filters' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'brand', required: false })
  @ApiQuery({ name: 'status', required: false })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.findAll(user.tenantId, store.id, query);
  }

  @Get('barcode/:code')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Find product by exact barcode or SKU' })
  async findByBarcode(
    @Req() req: Request,
    @Param('code') code: string,
  ): Promise<{ found: boolean; barcode?: string; product?: Record<string, unknown> | null }> {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.findByBarcode(user.tenantId, store.id, code);
  }

  @Get('barcode/:code/catalog')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Lookup barcode in grocery + retail catalogs with field mapping' })
  async lookupBarcodeCatalog(@Param('code') code: string) {
    return this.productsService.lookupBarcodeCatalog(code);
  }

  @Get(':id')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get single product with variants and bundles' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.findOne(user.tenantId, store.id, id);
  }

  @Post()
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Create product' })
  async create(@Req() req: Request, @Body() dto: CreateProductDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.create(user.tenantId, store.id, user.sub, dto);
  }

  @Put(':id')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update product' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.update(user.tenantId, store.id, user.sub, id, dto, {
      userName: user.fullName || user.email,
      ip: req.ip,
    });
  }

  @Post('bulk-delete')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Bulk delete products' })
  async bulkDelete(@Req() req: Request, @Body() body: { ids: string[] }) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.bulkDelete(user.tenantId, store.id, body.ids, user.sub);
  }

  @Post(':id/restore')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Restore soft-deleted product' })
  async restore(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.restore(user.tenantId, store.id, id);
  }

  @Post('bulk-status')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Bulk update product status' })
  async bulkStatus(@Req() req: Request, @Body() body: { ids: string[]; isActive: boolean }) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.bulkStatus(user.tenantId, store.id, body.ids, body.isActive);
  }

  // ── Variants ──

  @Get(':id/variants')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get product variants' })
  async getVariants(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.getVariants(user.tenantId, store.id, id);
  }

  @Post(':id/variants')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Add variant' })
  async createVariant(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.createVariant(user.tenantId, store.id, id, body);
  }

  @Put(':id/variants/:variantId')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Update variant' })
  async updateVariant(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() body: any,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.updateVariant(
      user.tenantId,
      store.id,
      id,
      variantId,
      body,
      user.userId || user.sub,
    );
  }

  @Delete(':id/variants/:variantId')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Delete variant' })
  async deleteVariant(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.deleteVariant(user.tenantId, store.id, id, variantId);
  }

  // ── Price History ──

  @Get(':id/price-history')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get product price history' })
  async getPriceHistory(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.productsService.getPriceHistory(user.tenantId, id);
  }

  // ── Bundles ──

  @Get(':id/bundles')
  @RequirePermissions('products.view')
  @ApiOperation({ summary: 'Get product bundle components' })
  async getBundles(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.productsService.getBundles(user.tenantId, id);
  }

  @Post(':id/bundles')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Add bundle component' })
  async addBundle(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { childProductId: string; quantity: number },
  ) {
    const user = req.user as any;
    return this.productsService.addBundle(user.tenantId, id, body.childProductId, body.quantity);
  }

  @Delete(':id/bundles/:childId')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Remove bundle component' })
  async removeBundle(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('childId') childId: string,
  ) {
    const user = req.user as any;
    return this.productsService.removeBundle(user.tenantId, id, childId);
  }

  // ── Images ──

  @Post(':id/images')
  @RequirePermissions('products.manage')
  @ApiOperation({ summary: 'Add image URLs to product' })
  async addImages(@Req() req: Request, @Param('id') id: string, @Body() body: { urls: string[] }) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.productsService.addImages(id, user.tenantId, store.id, body.urls);
  }
}
