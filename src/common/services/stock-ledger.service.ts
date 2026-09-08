import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { Warehouse, WarehouseDocument } from '../../database/schemas/warehouse.schema';
import { Stock, StockDocument } from '../../database/schemas/stock.schema';
import { StockMovement, StockMovementDocument } from '../../database/schemas/stock-movement.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../../database/schemas/product-variant.schema';

export type StockMovementType = 'in' | 'out' | 'adjustment' | 'transfer_in' | 'transfer_out';

export interface StockDeltaParams {
  tenantId: string;
  storeId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  type: StockMovementType;
  reason?: string;
  referenceId?: string;
  userId?: string;
  warehouseId?: string | null;
  session?: ClientSession | null;
}

@Injectable()
export class StockLedgerService {
  constructor(
    @InjectModel(Warehouse.name) private warehouseModel: Model<WarehouseDocument>,
    @InjectModel(Stock.name) private stockModel: Model<StockDocument>,
    @InjectModel(StockMovement.name) private movementModel: Model<StockMovementDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name) private variantModel: Model<ProductVariantDocument>,
  ) {}

  private sessionOpts(session?: ClientSession | null) {
    return session ? { session } : {};
  }

  private normalizeStockQuantity(quantity: number): number {
    const n = Number(quantity);
    if (!Number.isFinite(n) || n === 0) {
      throw new BadRequestException('Stock quantity change must be non-zero');
    }
    return Math.round((n + Number.EPSILON) * 1000) / 1000;
  }

  async ensureDefaultWarehouse(
    tenantId: string,
    storeId: string,
    session?: ClientSession | null,
  ): Promise<Types.ObjectId> {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    let warehouse = await this.warehouseModel
      .findOne({ tenantId: tid, storeId: sid, code: 'DEFAULT' })
      .session(session ?? null);

    if (!warehouse) {
      const created = await this.warehouseModel.create(
        [{ name: 'Default Warehouse', code: 'DEFAULT', tenantId: tid, storeId: sid }],
        this.sessionOpts(session),
      );
      warehouse = created[0];
    }

    return warehouse!._id as Types.ObjectId;
  }

  /** Available qty: warehouse ledger sum, falling back to product/variant stock fields. */
  async getAvailableQuantity(
    tenantId: string,
    storeId: string,
    productId: string,
    variantId?: string | null,
    session?: ClientSession | null,
  ): Promise<number> {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const pid = new Types.ObjectId(productId);
    const vid = variantId ? new Types.ObjectId(variantId) : null;

    const stockFilter: Record<string, unknown> = {
      tenantId: tid,
      storeId: sid,
      productId: pid,
      variantId: vid,
    };

    const rows = await this.stockModel
      .find(stockFilter)
      .session(session ?? null)
      .lean();
    if (rows.length > 0) {
      return rows.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0);
    }

    if (vid) {
      const variant = await this.variantModel
        .findOne({ _id: vid, tenantId: tid, storeId: sid, productId: pid })
        .session(session ?? null)
        .lean();
      return Number(variant?.stock ?? 0);
    }

    const product = await this.productModel
      .findOne({ _id: pid, tenantId: tid, storeId: sid })
      .session(session ?? null)
      .lean();
    return Number(product?.stock ?? 0);
  }

  /** Apply stock change (+/-) to ledger, movement log, and sync product/variant aggregate fields. */
  async applyDelta(params: StockDeltaParams): Promise<number> {
    const {
      tenantId,
      storeId,
      productId,
      variantId,
      quantity,
      type,
      reason,
      referenceId,
      userId,
      warehouseId: explicitWarehouseId,
      session,
    } = params;

    const normalizedQuantity = this.normalizeStockQuantity(quantity);

    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const pid = new Types.ObjectId(productId);
    const vid = variantId ? new Types.ObjectId(variantId) : null;
    const warehouseId = explicitWarehouseId
      ? new Types.ObjectId(explicitWarehouseId)
      : await this.ensureDefaultWarehouse(tenantId, storeId, session);

    if (normalizedQuantity < 0) {
      const requested = Math.abs(normalizedQuantity);
      const result = await this.stockModel.updateOne(
        {
          tenantId: tid,
          storeId: sid,
          warehouseId,
          productId: pid,
          variantId: vid,
          quantity: { $gte: requested },
        },
        { $inc: { quantity: normalizedQuantity } },
        this.sessionOpts(session),
      );
      if (result.modifiedCount === 0) {
        const stock = await this.stockModel
          .findOne({ tenantId: tid, storeId: sid, warehouseId, productId: pid, variantId: vid })
          .session(session ?? null)
          .lean();
        const available = Number(stock?.quantity ?? 0);
        throw new BadRequestException(
          `Insufficient stock (${available} available, ${requested} requested)`,
        );
      }
    } else {
      await this.stockModel.updateOne(
        { tenantId: tid, storeId: sid, warehouseId, productId: pid, variantId: vid },
        {
          $inc: { quantity: normalizedQuantity },
          $setOnInsert: { reserved: 0, reorderPoint: 5 },
        },
        { upsert: true, ...this.sessionOpts(session) },
      );
    }

    await this.movementModel.create(
      [
        {
          type,
          productId: pid,
          variantId: vid,
          warehouseId,
          quantity: normalizedQuantity,
          reason: reason || type,
          referenceId: referenceId ? new Types.ObjectId(referenceId) : null,
          date: new Date(),
          userId: userId ? new Types.ObjectId(userId) : null,
          tenantId: tid,
          storeId: sid,
        },
      ],
      this.sessionOpts(session),
    );

    return this.syncAggregateStock(tenantId, storeId, productId, variantId, session);
  }

  /** Deduct stock for a sale line (convenience wrapper). */
  async deductForSale(
    tenantId: string,
    storeId: string,
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    saleId: string,
    userId: string,
    session?: ClientSession | null,
  ): Promise<void> {
    await this.applyDelta({
      tenantId,
      storeId,
      productId,
      variantId: variantId || null,
      quantity: -Math.abs(quantity),
      type: 'out',
      reason: 'sale',
      referenceId: saleId,
      userId,
      session,
    });
  }

  /** Restore stock for a return line. */
  async restoreForReturn(
    tenantId: string,
    storeId: string,
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    returnId: string,
    userId: string,
    session?: ClientSession | null,
  ): Promise<void> {
    await this.applyDelta({
      tenantId,
      storeId,
      productId,
      variantId: variantId || null,
      quantity: Math.abs(quantity),
      type: 'in',
      reason: 'return',
      referenceId: returnId,
      userId,
      session,
    });
  }

  private async syncAggregateStock(
    tenantId: string,
    storeId: string,
    productId: string,
    variantId?: string | null,
    session?: ClientSession | null,
  ): Promise<number> {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const pid = new Types.ObjectId(productId);
    const vid = variantId ? new Types.ObjectId(variantId) : null;

    const rows = await this.stockModel
      .find({ tenantId: tid, storeId: sid, productId: pid, variantId: vid })
      .session(session ?? null)
      .lean();

    const total = rows.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0);

    if (vid) {
      await this.variantModel.updateOne(
        { _id: vid, tenantId: tid, storeId: sid, productId: pid },
        { $set: { stock: total } },
        this.sessionOpts(session),
      );
      await this.syncProductStockFromVariants(tenantId, storeId, productId, session);
    } else {
      await this.productModel.updateOne(
        { _id: pid, tenantId: tid, storeId: sid },
        { $set: { stock: total } },
        this.sessionOpts(session),
      );
    }

    return total;
  }

  private async syncProductStockFromVariants(
    tenantId: string,
    storeId: string,
    productId: string,
    session?: ClientSession | null,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const pid = new Types.ObjectId(productId);

    const variants = await this.variantModel
      .find({ tenantId: tid, storeId: sid, productId: pid })
      .session(session ?? null)
      .lean();

    const total = variants.reduce((sum, v) => sum + Number(v.stock ?? 0), 0);
    await this.productModel.updateOne(
      { _id: pid, tenantId: tid, storeId: sid },
      { $set: { stock: total } },
      this.sessionOpts(session),
    );
  }

  /** Seed ledger row from existing product.stock when first touched. */
  async ensureLedgerSeededFromProduct(
    tenantId: string,
    storeId: string,
    productId: string,
    variantId?: string | null,
    session?: ClientSession | null,
  ): Promise<void> {
    const available = await this.getAvailableQuantity(
      tenantId,
      storeId,
      productId,
      variantId,
      session,
    );
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const pid = new Types.ObjectId(productId);
    const vid = variantId ? new Types.ObjectId(variantId) : null;
    const warehouseId = await this.ensureDefaultWarehouse(tenantId, storeId, session);

    const existing = await this.stockModel
      .findOne({ tenantId: tid, storeId: sid, warehouseId, productId: pid, variantId: vid })
      .session(session ?? null);

    if (!existing && available > 0) {
      await this.stockModel.create(
        [
          {
            tenantId: tid,
            storeId: sid,
            warehouseId,
            productId: pid,
            variantId: vid,
            quantity: available,
            reserved: 0,
            reorderPoint: 5,
          },
        ],
        this.sessionOpts(session),
      );
    }
  }
}
