import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../../database/schemas/product-variant.schema';
import { PriceHistory, PriceHistoryDocument } from '../../database/schemas/price-history.schema';
import { Bundle, BundleDocument } from '../../database/schemas/bundle.schema';
import { Category, CategoryDocument } from '../../database/schemas/category.schema';
import { Brand, BrandDocument } from '../../database/schemas/brand.schema';
import { Unit, UnitDocument } from '../../database/schemas/unit.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  emptyDraft,
  finalizeCatalogResult,
  mapOpenFoodFacts,
  mapUpcItemDb,
  type CatalogLookupResult,
} from './utils/barcode-catalog.mapper';
import { AuditService } from '../../common/services/audit.service';
import { StockLedgerService } from '../../common/services/stock-ledger.service';
import {
  notDeletedFilter,
  softDeleteUpdate,
  restoreUpdate,
} from '../../common/utils/soft-delete.util';
import { escapeRegex } from '../../common/utils/regex.util';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name) private variantModel: Model<ProductVariantDocument>,
    @InjectModel(PriceHistory.name) private priceHistoryModel: Model<PriceHistoryDocument>,
    @InjectModel(Bundle.name) private bundleModel: Model<BundleDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Brand.name) private brandModel: Model<BrandDocument>,
    @InjectModel(Unit.name) private unitModel: Model<UnitDocument>,
    private auditService: AuditService,
    private stockLedger: StockLedgerService,
  ) {}

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private normalizeCode(value?: string) {
    return (value || '').trim();
  }

  private normalizeMoney(value: any) {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number < 0) {
      throw new BadRequestException('Product monetary and stock values cannot be negative');
    }
    return Math.round(number * 100) / 100;
  }

  private async assertLookupConsistency(
    tenantId: string,
    dto: Partial<CreateProductDto | UpdateProductDto>,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const checks: Array<Promise<any>> = [];
    if (dto.categoryId)
      checks.push(
        this.categoryModel.exists({
          _id: new Types.ObjectId(dto.categoryId),
          tenantId: tid,
          ...notDeletedFilter(),
        }),
      );
    if (dto.brandId)
      checks.push(
        this.brandModel.exists({
          _id: new Types.ObjectId(dto.brandId),
          tenantId: tid,
          ...notDeletedFilter(),
        }),
      );
    if (dto.unitId)
      checks.push(
        this.unitModel.exists({
          _id: new Types.ObjectId(dto.unitId),
          tenantId: tid,
          ...notDeletedFilter(),
        }),
      );
    const results = await Promise.all(checks);
    if (results.some((result) => !result)) {
      throw new BadRequestException(
        'Category, brand, or unit does not belong to this tenant or is inactive',
      );
    }
  }

  private async assertProductCodeAvailable(
    tenantId: string,
    storeId: string,
    code: { sku?: string; barcode?: string },
    excludeProductId?: Types.ObjectId,
    excludeVariantId?: Types.ObjectId,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const sku = this.normalizeCode(code.sku);
    const barcode = this.normalizeCode(code.barcode);
    const productOr: any[] = [];
    if (sku) productOr.push({ sku });
    if (barcode) productOr.push({ barcode });
    if (productOr.length) {
      const product = await this.productModel.findOne({
        tenantId: tid,
        storeId: sid,
        ...(excludeProductId ? { _id: { $ne: excludeProductId } } : {}),
        $or: productOr,
        ...notDeletedFilter(),
      });
      if (product) throw new ConflictException('SKU or barcode already exists for this store');
    }
    if (sku) {
      const variant = await this.variantModel.findOne({
        tenantId: tid,
        storeId: sid,
        sku,
        ...(excludeVariantId ? { _id: { $ne: excludeVariantId } } : {}),
      });
      if (variant) throw new ConflictException('SKU already exists on a variant in this store');
    }
  }

  private async assertVariantSkusAvailable(
    tenantId: string,
    storeId: string,
    skus: string[],
    excludeVariantId?: Types.ObjectId,
  ) {
    const normalized = skus.map((sku) => this.normalizeCode(sku)).filter(Boolean);
    if (new Set(normalized).size !== normalized.length) {
      throw new ConflictException('Variant SKUs must be unique within the product');
    }
    for (const sku of normalized) {
      await this.assertProductCodeAvailable(
        tenantId,
        storeId,
        { sku },
        undefined,
        excludeVariantId,
      );
    }
  }

  async findAll(tenantId: string, storeId: string, query: any): Promise<any> {
    const { page = 1, limit = 10, search, category, brand, status } = query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      ...notDeletedFilter(),
    };

    if (search) {
      const regex = new RegExp(escapeRegex(String(search)), 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { barcode: regex }];
    }
    if (category) filter.categoryId = new Types.ObjectId(category);
    if (brand) filter.brandId = new Types.ObjectId(brand);
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    const [data, total] = await Promise.all([
      this.productModel
        .find(filter)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      this.productModel.countDocuments(filter),
    ]);

    const products = data.map((p: any) => ({
      ...p,
      _id: p._id.toString(),
      categoryName: p.categoryId?.name || null,
      brandName: p.brandId?.name || null,
      categoryId:
        p.categoryId?._id?.toString() || (typeof p.categoryId === 'string' ? p.categoryId : null),
      brandId: p.brandId?._id?.toString() || (typeof p.brandId === 'string' ? p.brandId : null),
    }));

    return {
      data: products,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    };
  }

  async findOne(tenantId: string, storeId: string, id: string): Promise<any> {
    const product = await this.productModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      })
      .populate('categoryId', 'name')
      .populate('brandId', 'name')
      .populate('unitId', 'name abbreviation')
      .lean();

    if (!product) throw new NotFoundException('Product not found');

    const variants = await this.variantModel.find({ productId: product._id }).lean();

    const bundles = await this.bundleModel
      .find({ productId: product._id })
      .populate('childProductId', 'name sku price')
      .lean();

    return { ...product, variants, bundles };
  }

  async findByBarcode(
    tenantId: string,
    storeId: string,
    code: string,
  ): Promise<{ found: boolean; barcode?: string; product?: Record<string, unknown> | null }> {
    const trimmed = (code || '').trim();
    if (!trimmed) return { found: false, product: null };

    const product = await this.productModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        $or: [{ barcode: trimmed }, { sku: trimmed }],
        ...notDeletedFilter(),
      })
      .populate('categoryId', 'name')
      .populate('brandId', 'name')
      .lean();

    if (!product) return { found: false, product: null, barcode: trimmed };

    return {
      found: true,
      barcode: trimmed,
      product: {
        ...product,
        _id: (product as any)._id.toString(),
        categoryId: (product as any).categoryId?._id?.toString?.() || (product as any).categoryId,
        brandId: (product as any).brandId?._id?.toString?.() || (product as any).brandId,
        categoryName: (product as any).categoryId?.name || null,
        brandName: (product as any).brandId?.name || null,
      },
    };
  }

  async lookupBarcodeCatalog(code: string): Promise<CatalogLookupResult> {
    const trimmed = (code || '').trim();
    if (!trimmed || trimmed.length < 4) {
      throw new BadRequestException('Barcode must be at least 4 characters');
    }

    const sourcesTried: Array<'openfoodfacts' | 'upcitemdb'> = [];

    // 1) Open Food Facts — dairy, grocery, packaged food
    try {
      sourcesTried.push('openfoodfacts');
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(trimmed)}.json`,
        { headers: { 'User-Agent': 'SwiftPOS/1.0 (product-onboarding)' } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status === 1 && data.product) {
          const mapped = mapOpenFoodFacts(trimmed, data.product as Record<string, unknown>);
          if (mapped.name || mapped.description) {
            return finalizeCatalogResult(trimmed, 'openfoodfacts', sourcesTried, mapped);
          }
        }
      }
    } catch {
      /* try next provider */
    }

    // 2) UPC Item DB — electronics, phones, general retail
    try {
      sourcesTried.push('upcitemdb');
      const res = await fetch(
        `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(trimmed)}`,
        { headers: { Accept: 'application/json', 'User-Agent': 'SwiftPOS/1.0' } },
      );
      if (res.ok) {
        const data = await res.json();
        const item = data?.items?.[0];
        if (item) {
          const mapped = mapUpcItemDb(trimmed, item as Record<string, unknown>);
          if (mapped.name || mapped.description) {
            return finalizeCatalogResult(trimmed, 'upcitemdb', sourcesTried, mapped);
          }
        }
      }
    } catch {
      /* fall through to manual */
    }

    return finalizeCatalogResult(trimmed, 'manual', sourcesTried, emptyDraft(trimmed));
  }

  async create(tenantId: string, storeId: string, userId: string, dto: CreateProductDto) {
    const slug = this.slugify(dto.name);
    const sku = this.normalizeCode(dto.sku);
    const barcode = this.normalizeCode(dto.barcode);
    await this.assertLookupConsistency(tenantId, dto);
    await this.assertProductCodeAvailable(tenantId, storeId, { sku, barcode });

    const slugExists = await this.productModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      slug,
      ...notDeletedFilter(),
    });
    if (slugExists) throw new ConflictException('Product name already exists for this store');
    if (dto.hasVariants && dto.variants?.length) {
      const variantSkus = dto.variants.map((v) => this.normalizeCode(v.sku));
      if (variantSkus.some((variantSku) => !variantSku)) {
        throw new BadRequestException('Every variant must have a unique SKU');
      }
      if (variantSkus.includes(sku)) {
        throw new ConflictException('Variant SKU cannot match the parent product SKU');
      }
      await this.assertVariantSkusAvailable(tenantId, storeId, variantSkus);
    }

    const product = await this.productModel.create({
      name: dto.name,
      slug,
      description: dto.description || '',
      sku,
      barcode,
      categoryId: dto.categoryId ? new Types.ObjectId(dto.categoryId) : null,
      brandId: dto.brandId ? new Types.ObjectId(dto.brandId) : null,
      unitId: dto.unitId ? new Types.ObjectId(dto.unitId) : null,
      hasVariants: dto.hasVariants || false,
      price: this.normalizeMoney(dto.price),
      costPrice: this.normalizeMoney(dto.costPrice),
      stock: dto.hasVariants ? 0 : this.normalizeMoney(dto.stock),
      reorderPoint: this.normalizeMoney(dto.reorderPoint),
      taxRate: this.normalizeMoney(dto.taxRate),
      discountType: dto.discountType || null,
      discountValue: this.normalizeMoney(dto.discountValue),
      images: dto.images || [],
      image: dto.images?.[0] || '',
      storeId: new Types.ObjectId(storeId),
      tenantId: new Types.ObjectId(tenantId),
      isActive: dto.isActive !== false,
    });

    // Record initial price
    await this.priceHistoryModel.create({
      productId: product._id,
      price: dto.price,
      costPrice: dto.costPrice || 0,
      date: new Date(),
      userId: new Types.ObjectId(userId),
      tenantId: new Types.ObjectId(tenantId),
    });

    // Create variants if provided
    if (dto.hasVariants && dto.variants && dto.variants.length > 0) {
      const variantDocs = dto.variants.map((v) => ({
        productId: product._id,
        attributeValues: new Map(Object.entries(v.attributeValues || v.attributes || {})),
        price: this.normalizeMoney(v.price ?? dto.price),
        cost: this.normalizeMoney(v.costPrice ?? v.cost ?? dto.costPrice),
        stock: this.normalizeMoney(v.stock),
        sku: this.normalizeCode(v.sku),
        image: v.image || '',
        isActive: true,
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      }));
      await this.variantModel.insertMany(variantDocs);
    }

    return product;
  }

  async update(
    tenantId: string,
    storeId: string,
    userId: string,
    id: string,
    dto: UpdateProductDto,
    actor?: { userName?: string; ip?: string },
  ) {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      ...notDeletedFilter(),
    });
    if (!product) throw new NotFoundException('Product not found');

    await this.assertLookupConsistency(tenantId, dto);
    const nextSku = dto.sku !== undefined ? this.normalizeCode(dto.sku) : product.sku;
    const nextBarcode =
      dto.barcode !== undefined ? this.normalizeCode(dto.barcode) : product.barcode;
    if (dto.sku !== undefined || dto.barcode !== undefined) {
      await this.assertProductCodeAvailable(
        tenantId,
        storeId,
        { sku: nextSku, barcode: nextBarcode },
        product._id as Types.ObjectId,
      );
    }
    if (dto.name !== undefined) {
      const nextSlug = this.slugify(dto.name);
      const slugExists = await this.productModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        slug: nextSlug,
        _id: { $ne: product._id },
        ...notDeletedFilter(),
      });
      if (slugExists) throw new ConflictException('Product name already exists for this store');
    }

    const updates: any = {};
    if (dto.name !== undefined) {
      updates.name = dto.name;
      updates.slug = this.slugify(dto.name);
    }
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.sku !== undefined) updates.sku = nextSku;
    if (dto.barcode !== undefined) updates.barcode = nextBarcode;
    if (dto.categoryId !== undefined)
      updates.categoryId = dto.categoryId ? new Types.ObjectId(dto.categoryId) : null;
    if (dto.brandId !== undefined)
      updates.brandId = dto.brandId ? new Types.ObjectId(dto.brandId) : null;
    if (dto.unitId !== undefined)
      updates.unitId = dto.unitId ? new Types.ObjectId(dto.unitId) : null;
    if (dto.hasVariants !== undefined) updates.hasVariants = dto.hasVariants;
    if (dto.price !== undefined) updates.price = this.normalizeMoney(dto.price);
    if (dto.costPrice !== undefined) updates.costPrice = this.normalizeMoney(dto.costPrice);
    if (dto.reorderPoint !== undefined)
      updates.reorderPoint = this.normalizeMoney(dto.reorderPoint);
    if (dto.taxRate !== undefined) updates.taxRate = this.normalizeMoney(dto.taxRate);
    if (dto.discountType !== undefined) updates.discountType = dto.discountType;
    if (dto.discountValue !== undefined)
      updates.discountValue = this.normalizeMoney(dto.discountValue);
    if (dto.images !== undefined) {
      updates.images = dto.images;
      updates.image = dto.images[0] || '';
    }
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    // Track price changes
    if (dto.price !== undefined && dto.price !== product.price) {
      await this.priceHistoryModel.create({
        productId: product._id,
        price: updates.price,
        costPrice: dto.costPrice ?? product.costPrice,
        date: new Date(),
        userId: new Types.ObjectId(userId),
        tenantId: new Types.ObjectId(tenantId),
      });
      await this.auditService.log({
        tenantId,
        storeId,
        userId,
        userName: actor?.userName || userId,
        action: 'product.price_change',
        entity: 'product',
        entityId: id,
        summary: `Price changed for "${product.name}" from ${product.price} to ${dto.price}`,
        before: { price: product.price },
        after: { price: dto.price },
        ip: actor?.ip,
      });
    }

    if (dto.costPrice !== undefined && dto.costPrice !== product.costPrice) {
      await this.auditService.log({
        tenantId,
        storeId,
        userId,
        userName: actor?.userName || userId,
        action: 'product.cost_change',
        entity: 'product',
        entityId: id,
        summary: `Cost changed for "${product.name}" from ${product.costPrice} to ${dto.costPrice}`,
        before: { costPrice: product.costPrice },
        after: { costPrice: dto.costPrice },
        ip: actor?.ip,
      });
    }

    // Stock quantity must flow through the ledger — never write product.stock directly.
    if (dto.stock !== undefined) {
      const targetStock = Number(dto.stock);
      const currentStock = await this.stockLedger.getAvailableQuantity(tenantId, storeId, id, null);
      const delta = targetStock - currentStock;
      if (delta !== 0) {
        await this.stockLedger.applyDelta({
          tenantId,
          storeId,
          productId: id,
          variantId: null,
          quantity: delta,
          type: 'adjustment',
          reason: 'Manual stock correction (product update)',
          userId,
        });
      }
    }

    const updated = await this.productModel
      .findByIdAndUpdate(product._id, { $set: updates }, { new: true })
      .lean();
    return updated;
  }

  async bulkDelete(tenantId: string, storeId: string, ids: string[], deletedBy?: string) {
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const result = await this.productModel.updateMany(
      {
        _id: { $in: objectIds },
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      },
      softDeleteUpdate(deletedBy),
    );
    return { deleted: result.modifiedCount };
  }

  async restore(tenantId: string, storeId: string, id: string) {
    const result = await this.productModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        deletedAt: { $ne: null },
      },
      restoreUpdate(),
      { new: true },
    );
    if (!result) throw new NotFoundException('Deleted product not found');
    return result;
  }

  async bulkStatus(tenantId: string, storeId: string, ids: string[], isActive: boolean) {
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const result = await this.productModel.updateMany(
      {
        _id: { $in: objectIds },
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      { $set: { isActive } },
    );
    return { updated: result.modifiedCount };
  }

  // ── Variants ──────────────────────────────────────────────────────

  async getVariants(tenantId: string, storeId: string, productId: string) {
    return this.variantModel
      .find({
        productId: new Types.ObjectId(productId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .lean();
  }

  async createVariant(tenantId: string, storeId: string, productId: string, data: any) {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(productId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      ...notDeletedFilter(),
    });
    if (!product) throw new NotFoundException('Product not found');
    const sku = this.normalizeCode(data.sku);
    if (!sku) throw new BadRequestException('Variant SKU is required');
    if (sku === product.sku)
      throw new ConflictException('Variant SKU cannot match the parent product SKU');
    await this.assertProductCodeAvailable(tenantId, storeId, { sku });
    return this.variantModel.create({
      productId: new Types.ObjectId(productId),
      attributeValues: new Map(Object.entries(data.attributeValues || {})),
      price: this.normalizeMoney(data.price),
      cost: this.normalizeMoney(data.cost),
      stock: this.normalizeMoney(data.stock),
      sku,
      image: data.image || '',
      isActive: true,
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
  }

  async updateVariant(
    tenantId: string,
    storeId: string,
    productId: string,
    variantId: string,
    data: any,
    userId?: string,
  ) {
    const variant = await this.variantModel.findOne({
      _id: new Types.ObjectId(variantId),
      productId: new Types.ObjectId(productId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const update: any = {};
    if (data.price !== undefined) update.price = this.normalizeMoney(data.price);
    if (data.cost !== undefined) update.cost = this.normalizeMoney(data.cost);
    if (data.sku !== undefined) {
      const sku = this.normalizeCode(data.sku);
      if (!sku) throw new BadRequestException('Variant SKU is required');
      const product = await this.productModel.findOne({
        _id: new Types.ObjectId(productId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      });
      if (!product) throw new NotFoundException('Product not found');
      if (sku === product.sku)
        throw new ConflictException('Variant SKU cannot match the parent product SKU');
      await this.assertProductCodeAvailable(
        tenantId,
        storeId,
        { sku },
        undefined,
        variant._id as Types.ObjectId,
      );
      update.sku = sku;
    }
    if (data.image !== undefined) update.image = data.image;
    if (data.isActive !== undefined) update.isActive = data.isActive;

    if (data.stock !== undefined && userId) {
      const targetStock = Number(data.stock);
      const currentStock = await this.stockLedger.getAvailableQuantity(
        tenantId,
        storeId,
        productId,
        variantId,
      );
      const delta = targetStock - currentStock;
      if (delta !== 0) {
        await this.stockLedger.applyDelta({
          tenantId,
          storeId,
          productId,
          variantId,
          quantity: delta,
          type: 'adjustment',
          reason: 'Manual stock correction (variant update)',
          userId,
        });
      }
    }

    return this.variantModel.findByIdAndUpdate(variant._id, { $set: update }, { new: true }).lean();
  }

  async deleteVariant(tenantId: string, storeId: string, productId: string, variantId: string) {
    const result = await this.variantModel.deleteOne({
      _id: new Types.ObjectId(variantId),
      productId: new Types.ObjectId(productId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Variant not found');
    return { deleted: true };
  }

  // ── Price History ─────────────────────────────────────────────────

  async getPriceHistory(tenantId: string, productId: string) {
    return this.priceHistoryModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        productId: new Types.ObjectId(productId),
      })
      .sort({ date: -1 })
      .limit(50)
      .populate('userId', 'email')
      .lean();
  }

  // ── Bundles ───────────────────────────────────────────────────────

  async getBundles(tenantId: string, productId: string) {
    return this.bundleModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        productId: new Types.ObjectId(productId),
      })
      .populate('childProductId', 'name sku price image')
      .lean();
  }

  async addBundle(tenantId: string, productId: string, childProductId: string, quantity: number) {
    return this.bundleModel.findOneAndUpdate(
      {
        tenantId: new Types.ObjectId(tenantId),
        productId: new Types.ObjectId(productId),
        childProductId: new Types.ObjectId(childProductId),
      },
      { $set: { quantity, tenantId: new Types.ObjectId(tenantId) } },
      { upsert: true, new: true },
    );
  }

  async removeBundle(tenantId: string, productId: string, childProductId: string) {
    await this.bundleModel.deleteOne({
      tenantId: new Types.ObjectId(tenantId),
      productId: new Types.ObjectId(productId),
      childProductId: new Types.ObjectId(childProductId),
    });
    return { deleted: true };
  }

  // ── Image management ──────────────────────────────────────────────

  async addImages(id: string, tenantId: string, storeId: string, urls: string[]) {
    const product = await this.productModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      { $push: { images: { $each: urls } } },
      { new: true },
    );
    if (!product) throw new NotFoundException('Product not found');
    if (!product.image && urls.length > 0) {
      product.image = urls[0];
      await product.save();
    }
    return { images: product.images };
  }
}
