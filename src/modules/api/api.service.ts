import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { CatalogService } from '../catalog/catalog.service';
import { escapeRegex } from '../../common/utils/regex.util';

@Injectable()
export class ApiService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(SaleOrder.name) private saleModel: Model<SaleOrderDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    private catalogService: CatalogService,
  ) {}

  async getProducts(tenantId: string, query: any) {
    const catalogMode = await this.catalogService.getCatalogMode(tenantId);

    if (catalogMode === 'central' && query.storeId) {
      return this.catalogService.resolveStoreProducts(tenantId, query.storeId, query);
    }

    const filter: any = { tenantId: new Types.ObjectId(tenantId), isActive: true };
    if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);
    const skip = (page - 1) * limit;

    if (query.search) {
      const regex = new RegExp(escapeRegex(String(query.search)), 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { barcode: regex }];
    }

    const [data, total] = await Promise.all([
      this.productModel
        .find(filter)
        .select('name sku barcode price costPrice stock storeId categoryId brandId image isActive')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.productModel.countDocuments(filter),
    ]);

    return {
      data: data.map((p: any) => ({ ...p, _id: p._id.toString(), storeId: p.storeId?.toString() })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSales(tenantId: string, query: any) {
    const filter: any = { tenantId: new Types.ObjectId(tenantId) };
    if (query.storeId) filter.storeId = new Types.ObjectId(query.storeId);
    if (query.status) filter.status = query.status;

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.saleModel
        .find(filter)
        .select(
          'orderNumber invoiceNumber date total status paymentStatus storeId items customerId',
        )
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.saleModel.countDocuments(filter),
    ]);

    return {
      data: data.map((s: any) => ({
        ...s,
        _id: s._id.toString(),
        storeId: s.storeId?.toString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStores(tenantId: string) {
    const stores = await this.storeModel
      .find({ tenantId: new Types.ObjectId(tenantId), isActive: true })
      .select('name code address city phone currency')
      .sort({ name: 1 })
      .lean();

    return {
      data: stores.map((s: any) => ({ ...s, _id: s._id.toString() })),
    };
  }
}
