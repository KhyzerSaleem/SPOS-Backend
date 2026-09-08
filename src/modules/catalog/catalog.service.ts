import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CatalogProduct,
  CatalogProductDocument,
} from '../../database/schemas/catalog-product.schema';
import { StoreListing, StoreListingDocument } from '../../database/schemas/store-listing.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { PLAN_DEFINITIONS } from '../../common/constants/plan-features';
import { escapeRegex } from '../../common/utils/regex.util';

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(CatalogProduct.name) private catalogModel: Model<CatalogProductDocument>,
    @InjectModel(StoreListing.name) private listingModel: Model<StoreListingDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
  ) {}

  private tid(tenantId: string) {
    return new Types.ObjectId(tenantId);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async getCatalogMode(tenantId: string): Promise<'per_store' | 'central'> {
    const tenant = await this.tenantModel.findById(tenantId).lean();
    return tenant?.settings?.catalogMode ?? 'per_store';
  }

  async assertMultiStoreAccess(tenantId: string) {
    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    const planDef = PLAN_DEFINITIONS[tenant.plan as keyof typeof PLAN_DEFINITIONS];
    const maxStores = tenant.maxStores ?? planDef?.maxStores ?? 1;
    if (maxStores <= 1) {
      throw new ForbiddenException(
        'Central catalog requires a Pro or Enterprise plan with multiple stores',
      );
    }
  }

  async findAll(tenantId: string, query: any) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);
    const skip = (page - 1) * limit;
    const filter: any = { tenantId: this.tid(tenantId) };

    if (query.search) {
      const regex = new RegExp(escapeRegex(String(query.search)), 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { barcode: regex }];
    }
    if (query.status === 'active') filter.isActive = true;
    if (query.status === 'inactive') filter.isActive = false;

    const [data, total] = await Promise.all([
      this.catalogModel
        .find(filter)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.catalogModel.countDocuments(filter),
    ]);

    const listings = await this.listingModel
      .find({ tenantId: this.tid(tenantId), catalogProductId: { $in: data.map((d) => d._id) } })
      .lean();

    const listingMap = new Map<string, any[]>();
    for (const l of listings) {
      const key = l.catalogProductId.toString();
      if (!listingMap.has(key)) listingMap.set(key, []);
      listingMap.get(key)!.push(l);
    }

    return {
      data: data.map((p: any) => ({
        ...p,
        _id: p._id.toString(),
        listings: listingMap.get(p._id.toString()) || [],
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(tenantId: string, id: string): Promise<any> {
    const product = await this.catalogModel
      .findOne({ _id: id, tenantId: this.tid(tenantId) })
      .populate('categoryId', 'name')
      .populate('brandId', 'name')
      .lean();
    if (!product) throw new NotFoundException('Catalog product not found');

    const listings = await this.listingModel
      .find({ tenantId: this.tid(tenantId), catalogProductId: product._id })
      .populate('storeId', 'name code')
      .lean();

    return { ...product, listings };
  }

  async create(tenantId: string, dto: any) {
    await this.assertMultiStoreAccess(tenantId);
    const tid = this.tid(tenantId);
    const slug = this.slugify(dto.name);
    const exists = await this.catalogModel.findOne({
      tenantId: tid,
      $or: [{ sku: dto.sku }, { slug }],
    });
    if (exists) throw new ConflictException('SKU or slug already exists in catalog');

    return this.catalogModel.create({
      name: dto.name,
      slug,
      description: dto.description || '',
      sku: dto.sku,
      barcode: dto.barcode || '',
      images: dto.images || [],
      image: dto.image || dto.images?.[0] || '',
      categoryId: dto.categoryId || null,
      brandId: dto.brandId || null,
      unitId: dto.unitId || null,
      hasVariants: dto.hasVariants || false,
      price: dto.price ?? 0,
      costPrice: dto.costPrice ?? 0,
      taxRate: dto.taxRate ?? 0,
      isActive: dto.isActive !== false,
      tenantId: tid,
    });
  }

  async update(tenantId: string, id: string, dto: any) {
    await this.assertMultiStoreAccess(tenantId);
    const product = await this.catalogModel.findOne({ _id: id, tenantId: this.tid(tenantId) });
    if (!product) throw new NotFoundException('Catalog product not found');

    if (dto.name) product.name = dto.name;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.sku) product.sku = dto.sku;
    if (dto.barcode !== undefined) product.barcode = dto.barcode;
    if (dto.images) product.images = dto.images;
    if (dto.image !== undefined) product.image = dto.image;
    if (dto.categoryId !== undefined) product.categoryId = dto.categoryId;
    if (dto.brandId !== undefined) product.brandId = dto.brandId;
    if (dto.unitId !== undefined) product.unitId = dto.unitId;
    if (dto.price !== undefined) product.price = dto.price;
    if (dto.costPrice !== undefined) product.costPrice = dto.costPrice;
    if (dto.taxRate !== undefined) product.taxRate = dto.taxRate;
    if (dto.isActive !== undefined) product.isActive = dto.isActive;

    await product.save();
    return product;
  }

  async remove(tenantId: string, id: string) {
    await this.assertMultiStoreAccess(tenantId);
    const result = await this.catalogModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
    if (!result.deletedCount) throw new NotFoundException('Catalog product not found');
    await this.listingModel.deleteMany({ tenantId: this.tid(tenantId), catalogProductId: id });
    return { deleted: true };
  }

  /** Publish catalog product to stores — creates StoreListing + shadow Product for POS. */
  async publishToStores(
    tenantId: string,
    catalogProductId: string,
    dto: { storeIds: string[]; price?: number; costPrice?: number; localSku?: string },
  ) {
    await this.assertMultiStoreAccess(tenantId);
    const catalog = await this.catalogModel.findOne({
      _id: catalogProductId,
      tenantId: this.tid(tenantId),
    });
    if (!catalog) throw new NotFoundException('Catalog product not found');
    if (!dto.storeIds?.length) throw new BadRequestException('storeIds is required');

    const stores = await this.storeModel
      .find({
        tenantId: this.tid(tenantId),
        _id: { $in: dto.storeIds.map((id) => new Types.ObjectId(id)) },
        isActive: true,
      })
      .lean();

    if (stores.length !== dto.storeIds.length) {
      throw new BadRequestException('One or more store IDs are invalid');
    }

    const results: Array<{ storeId: string; listingId: unknown; shadowProductId: unknown }> = [];
    for (const store of stores) {
      const storeId = store._id.toString();
      const price = dto.price ?? catalog.price;
      const costPrice = dto.costPrice ?? catalog.costPrice;
      const sku = dto.localSku || catalog.sku;

      let listing = await this.listingModel.findOne({
        tenantId: this.tid(tenantId),
        catalogProductId: catalog._id,
        storeId: store._id,
      });

      if (!listing) {
        listing = await this.listingModel.create({
          catalogProductId: catalog._id,
          storeId: store._id,
          tenantId: this.tid(tenantId),
          price,
          costPrice,
          isActive: true,
          localSku: dto.localSku || '',
        });
      } else {
        listing.price = price;
        listing.costPrice = costPrice;
        listing.isActive = true;
        if (dto.localSku) listing.localSku = dto.localSku;
        await listing.save();
      }

      const shadow = await this.syncShadowProduct(tenantId, storeId, catalog, listing, sku);
      await this.listingModel.updateOne(
        { _id: listing._id },
        { $set: { shadowProductId: shadow._id } },
      );

      results.push({ storeId, listingId: listing._id, shadowProductId: shadow._id });
    }

    return { published: results.length, results };
  }

  private async syncShadowProduct(
    tenantId: string,
    storeId: string,
    catalog: CatalogProductDocument,
    listing: StoreListingDocument,
    sku: string,
  ) {
    const tid = this.tid(tenantId);
    const sid = new Types.ObjectId(storeId);
    const slug = `${this.slugify(catalog.name)}-${storeId.slice(-6)}`;

    const product = await this.productModel.findOne({
      tenantId: tid,
      storeId: sid,
      catalogProductId: catalog._id,
    });

    const payload = {
      name: catalog.name,
      description: catalog.description,
      sku,
      barcode: catalog.barcode,
      images: catalog.images,
      image: catalog.image,
      categoryId: catalog.categoryId,
      brandId: catalog.brandId,
      unitId: catalog.unitId,
      hasVariants: catalog.hasVariants,
      price: listing.price,
      costPrice: listing.costPrice,
      taxRate: catalog.taxRate,
      isActive: listing.isActive && catalog.isActive,
      catalogProductId: catalog._id,
    };

    if (product) {
      await this.productModel.updateOne({ _id: product._id }, { $set: payload });
      return product;
    }

    try {
      const created = await this.productModel.create({
        ...payload,
        slug,
        tenantId: tid,
        storeId: sid,
        stock: 0,
        reorderPoint: 0,
      });
      return created;
    } catch (err: any) {
      if (err?.code === 11000) {
        const altSku = `${sku}-${storeId.slice(-4)}`;
        return this.productModel.create({
          ...payload,
          sku: altSku,
          slug: `${slug}-${storeId.slice(-4)}`,
          tenantId: tid,
          storeId: sid,
          stock: 0,
          reorderPoint: 0,
        });
      }
      throw err;
    }
  }

  /** Resolve active store products from listings (for API / central mode). */
  async resolveStoreProducts(tenantId: string, storeId: string, query: any) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);
    const skip = (page - 1) * limit;

    const listings = await this.listingModel
      .find({ tenantId: this.tid(tenantId), storeId: new Types.ObjectId(storeId), isActive: true })
      .populate({
        path: 'catalogProductId',
        match: { isActive: true },
      })
      .skip(skip)
      .limit(limit)
      .lean();

    const active = listings.filter((l: any) => l.catalogProductId);
    const total = await this.listingModel.countDocuments({
      tenantId: this.tid(tenantId),
      storeId: new Types.ObjectId(storeId),
      isActive: true,
    });

    const data = active.map((l: any) => {
      const c = l.catalogProductId;
      return {
        _id: l.shadowProductId?.toString() || c._id.toString(),
        catalogProductId: c._id.toString(),
        name: c.name,
        sku: l.localSku || c.sku,
        barcode: c.barcode,
        price: l.price,
        costPrice: l.costPrice,
        categoryId: c.categoryId,
        brandId: c.brandId,
        image: c.image,
        storeId,
      };
    });

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }
}
