import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Warehouse, WarehouseDocument } from '../../database/schemas/warehouse.schema';
import { Stock, StockDocument } from '../../database/schemas/stock.schema';
import { StockMovement, StockMovementDocument } from '../../database/schemas/stock-movement.schema';
import {
  StockAdjustment,
  StockAdjustmentDocument,
} from '../../database/schemas/stock-adjustment.schema';
import { Transfer, TransferDocument } from '../../database/schemas/transfer.schema';
import { Batch, BatchDocument } from '../../database/schemas/batch.schema';
import { CycleCount, CycleCountDocument } from '../../database/schemas/cycle-count.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { StockLedgerService } from '../../common/services/stock-ledger.service';
import { PLAN_DEFINITIONS } from '../../common/constants/plan-features';
import { AuditService } from '../../common/services/audit.service';
import { WebhookDispatchService } from '../../common/services/webhook-dispatch.service';
import { NotificationsService } from '../notifications/notifications.service';
import { notDeletedFilter, softDeleteUpdate } from '../../common/utils/soft-delete.util';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(Warehouse.name) private warehouseModel: Model<WarehouseDocument>,
    @InjectModel(Stock.name) private stockModel: Model<StockDocument>,
    @InjectModel(StockMovement.name) private movementModel: Model<StockMovementDocument>,
    @InjectModel(StockAdjustment.name) private adjustmentModel: Model<StockAdjustmentDocument>,
    @InjectModel(Transfer.name) private transferModel: Model<TransferDocument>,
    @InjectModel(Batch.name) private batchModel: Model<BatchDocument>,
    @InjectModel(CycleCount.name) private cycleCountModel: Model<CycleCountDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectConnection() private connection: Connection,
    private stockLedger: StockLedgerService,
    private auditService: AuditService,
    private webhookDispatch: WebhookDispatchService,
    private notificationsService: NotificationsService,
  ) {}

  private normalizeQuantity(value: any, field = 'Quantity') {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw new BadRequestException(`${field} must be greater than zero`);
    }
    return Math.round(number * 1000) / 1000;
  }

  private normalizeCount(value: any, field = 'Counted quantity') {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new BadRequestException(`${field} cannot be negative`);
    }
    return Math.round(number * 1000) / 1000;
  }

  private async assertProductInStore(tenantId: string, storeId: string, productId: string) {
    const product = await this.productModel
      .findOne({
        _id: new Types.ObjectId(productId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      })
      .lean();
    if (!product) throw new BadRequestException('Product does not belong to this store');
    return product;
  }

  private async assertMultiStoreAccess(tenantId: string) {
    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    const planDef = PLAN_DEFINITIONS[tenant.plan as keyof typeof PLAN_DEFINITIONS];
    const maxStores = tenant.maxStores ?? planDef?.maxStores ?? 1;
    if (maxStores <= 1) {
      throw new ForbiddenException('Cross-store transfers require a Pro or Enterprise plan');
    }
  }

  // ── Warehouse CRUD ──

  async findAllWarehouses(tenantId: string, storeId: string, query: any): Promise<any> {
    const filter: any = { tenantId, ...notDeletedFilter() };
    if (query.allStores === 'true' || query.allStores === true) {
      await this.assertMultiStoreAccess(tenantId);
    } else {
      filter.storeId = storeId;
    }
    if (query.search) filter.name = { $regex: query.search, $options: 'i' };

    const data = await this.warehouseModel.find(filter).sort({ createdAt: -1 }).lean();
    const storeIds = [...new Set(data.map((w: any) => w.storeId?.toString()).filter(Boolean))];
    const stores = storeIds.length
      ? await this.storeModel
          .find({ _id: { $in: storeIds } })
          .select('name code')
          .lean()
      : [];
    const storeMap = new Map(stores.map((s: any) => [s._id.toString(), s]));

    return {
      data: data.map((w: any) => ({
        ...w,
        storeName: storeMap.get(w.storeId?.toString())?.name || '',
        storeCode: storeMap.get(w.storeId?.toString())?.code || '',
      })),
    };
  }

  async createWarehouse(tenantId: string, storeId: string, dto: any): Promise<any> {
    const exists = await this.warehouseModel.findOne({
      tenantId,
      storeId,
      code: dto.code,
      ...notDeletedFilter(),
    });
    if (exists) throw new BadRequestException('Warehouse code already exists');
    return this.warehouseModel.create({ ...dto, tenantId, storeId });
  }

  async updateWarehouse(tenantId: string, storeId: string, id: string, dto: any): Promise<any> {
    // Whitelist explicitly — dto is untyped (no class-validator DTO on this route),
    // so spreading it raw into $set would let a caller overwrite tenantId/storeId
    // and reassign this warehouse to a different tenant or store.
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.code !== undefined) patch.code = dto.code;
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    const wh = await this.warehouseModel.findOneAndUpdate(
      { _id: id, tenantId, storeId, ...notDeletedFilter() },
      { $set: patch },
      { new: true },
    );
    if (!wh) throw new NotFoundException('Warehouse not found');
    return wh;
  }

  async deleteWarehouse(
    tenantId: string,
    storeId: string,
    id: string,
    deletedBy?: string,
  ): Promise<any> {
    const result = await this.warehouseModel.updateOne(
      { _id: id, tenantId, storeId, ...notDeletedFilter() },
      softDeleteUpdate(deletedBy),
    );
    if (result.modifiedCount === 0) throw new NotFoundException('Warehouse not found');
    return { deleted: true };
  }

  // ── Stock Overview ──

  async getStock(tenantId: string, storeId: string, query: any): Promise<any> {
    const filter: any = { tenantId, storeId };
    if (query.warehouseId) filter.warehouseId = query.warehouseId;

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;

    const stockRecords = await this.stockModel
      .find(filter)
      .populate('productId', 'name sku barcode')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    let data = stockRecords.map((s: any) => ({
      _id: s._id,
      productName: s.productId?.name || '',
      sku: s.productId?.sku || '',
      variantLabel: s.variantId || null,
      currentStock: s.quantity,
      reserved: s.reserved,
      reorderPoint: s.reorderPoint,
      warehouseId: s.warehouseId,
    }));

    if (query.search) {
      const q = query.search.toLowerCase();
      data = data.filter(
        (d) => d.productName.toLowerCase().includes(q) || d.sku.toLowerCase().includes(q),
      );
    }

    return { data };
  }

  // ── Stock Adjustments ──

  async getAdjustments(tenantId: string, storeId: string, query: any): Promise<any> {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const data = await this.adjustmentModel
      .find({ tenantId, storeId })
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { data };
  }

  async createAdjustment(
    tenantId: string,
    storeId: string,
    userId: string,
    dto: any,
    actor?: { userName?: string },
  ): Promise<any> {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const adjustmentNumber = `ADJ-${Date.now().toString(36).toUpperCase()}`;
      let items = dto.items || [];

      // Support single-item shorthand from frontend
      if (items.length === 0 && dto.productId) {
        items = [
          {
            productId: dto.productId,
            productName: dto.productName || '',
            quantity: dto.quantity,
            reason: dto.reason || 'other',
          },
        ];
      }
      if (!items.length) throw new BadRequestException('At least one adjustment item is required');

      // Get or create default warehouse
      let warehouseId = dto.warehouseId;
      let warehouseName = '';
      if (warehouseId) {
        const wh = await this.warehouseModel
          .findOne({ _id: warehouseId, tenantId, storeId })
          .session(session);
        warehouseName = wh?.name || '';
      } else {
        let defaultWh = await this.warehouseModel
          .findOne({ tenantId, storeId, code: 'DEFAULT' })
          .session(session);
        if (!defaultWh) {
          const created = await this.warehouseModel.create(
            [{ name: 'Default Warehouse', code: 'DEFAULT', tenantId, storeId }],
            { session },
          );
          defaultWh = created[0];
        }
        warehouseId = defaultWh!._id;
        warehouseName = defaultWh!.name;
      }

      const adjustment = await this.adjustmentModel.create(
        [
          {
            adjustmentNumber,
            warehouseId,
            warehouseName,
            items,
            status: 'completed',
            createdBy: userId,
            date: new Date(),
            note: dto.note || '',
            tenantId,
            storeId,
          },
        ],
        { session },
      );

      // Apply stock changes through the ledger so product/variant aggregates stay in sync.
      for (const item of items) {
        await this.assertProductInStore(tenantId, storeId, String(item.productId));
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity === 0) {
          throw new BadRequestException('Adjustment quantity must be a non-zero number');
        }
        await this.stockLedger.applyDelta({
          tenantId,
          storeId,
          productId: String(item.productId),
          variantId: item.variantId ? String(item.variantId) : null,
          quantity,
          type: 'adjustment',
          reason: item.reason || 'Stock adjustment',
          referenceId: adjustment[0]._id.toString(),
          userId,
          warehouseId: String(warehouseId),
          session,
        });
      }

      await session.commitTransaction();

      await this.auditService.log({
        tenantId,
        storeId,
        userId,
        userName: actor?.userName || userId,
        action: 'stock.adjustment',
        entity: 'stock_adjustment',
        entityId: adjustment[0]._id.toString(),
        summary: `Stock adjustment ${adjustmentNumber} (${items.length} item(s))`,
      });

      for (const item of items) {
        const stock = await this.stockModel
          .findOne({
            tenantId,
            storeId,
            warehouseId,
            productId: item.productId,
            variantId: item.variantId || null,
          })
          .lean();
        if (stock && stock.quantity <= (stock.reorderPoint || 0)) {
          this.webhookDispatch.emit(tenantId, 'stock.low', {
            productId: item.productId?.toString?.() || item.productId,
            variantId: item.variantId?.toString?.() || null,
            quantity: stock.quantity,
            reorderPoint: stock.reorderPoint,
            storeId,
          });
        }
      }

      return adjustment[0];
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      void session.endSession();
    }
  }

  // ── Stock Transfers ──

  async getTransfers(tenantId: string, storeId: string, query: any): Promise<any> {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const sid = new Types.ObjectId(storeId);
    const data = await this.transferModel
      .find({
        tenantId,
        $or: [{ storeId: sid }, { fromStoreId: sid }, { toStoreId: sid }],
      })
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { data };
  }

  async createTransfer(tenantId: string, storeId: string, userId: string, dto: any): Promise<any> {
    const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}`;
    const fromWh = await this.warehouseModel.findOne({ _id: dto.fromWarehouseId, tenantId });
    const toWh = await this.warehouseModel.findOne({ _id: dto.toWarehouseId, tenantId });
    if (!fromWh || !toWh) throw new BadRequestException('Invalid warehouse IDs');
    if (fromWh._id.toString() === toWh._id.toString()) {
      throw new BadRequestException('Source and destination warehouses must differ');
    }

    const fromStoreId = fromWh.storeId.toString();
    const toStoreId = toWh.storeId.toString();
    const isCrossStore = fromStoreId !== toStoreId;

    if (isCrossStore) {
      await this.assertMultiStoreAccess(tenantId);
    }
    if (!dto.items?.length) throw new BadRequestException('Transfer requires at least one item');
    const items: any[] = [];
    for (const item of dto.items) {
      await this.assertProductInStore(tenantId, fromStoreId, String(item.productId));
      items.push({
        ...item,
        quantity: this.normalizeQuantity(item.quantity, 'Transfer quantity'),
        status: 'pending',
      });
    }

    const transfer = await this.transferModel.create({
      transferNumber,
      fromWarehouseId: dto.fromWarehouseId,
      fromWarehouseName: fromWh.name,
      toWarehouseId: dto.toWarehouseId,
      toWarehouseName: toWh.name,
      items,
      status: 'draft',
      createdBy: userId,
      date: new Date(),
      notes: dto.notes || '',
      tenantId,
      storeId: isCrossStore ? fromStoreId : storeId,
      fromStoreId: fromWh.storeId,
      toStoreId: toWh.storeId,
    });
    await this.safeNotifyTransfer(tenantId, {
      transferNumber,
      status: 'created',
      fromWarehouse: fromWh.name,
      toWarehouse: toWh.name,
    });
    return transfer;
  }

  private async resolveDestinationProductId(
    tenantId: string,
    fromStoreId: string,
    toStoreId: string,
    sourceProductId: string,
  ): Promise<string> {
    if (fromStoreId === toStoreId) return sourceProductId;

    const source = await this.productModel
      .findOne({
        _id: sourceProductId,
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(fromStoreId),
      })
      .lean();
    if (!source) throw new BadRequestException('Source product not found');

    const destFilter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(toStoreId),
      isActive: true,
    };
    if (source.catalogProductId) {
      destFilter.catalogProductId = source.catalogProductId;
    } else {
      destFilter.sku = source.sku;
    }

    const dest = await this.productModel.findOne(destFilter).lean();
    if (!dest) {
      throw new BadRequestException(
        `Product "${source.name}" is not available at the destination store. Publish it first.`,
      );
    }
    return dest._id.toString();
  }

  async updateTransferStatus(
    tenantId: string,
    storeId: string,
    userId: string,
    id: string,
    status: string,
  ): Promise<any> {
    const sid = new Types.ObjectId(storeId);
    const transfer = await this.transferModel.findOne({
      _id: id,
      tenantId,
      $or: [{ storeId: sid }, { fromStoreId: sid }, { toStoreId: sid }],
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    const fromStoreId = (transfer.fromStoreId || transfer.storeId).toString();
    const toStoreId = (transfer.toStoreId || transfer.storeId).toString();

    if (status === 'in_transit' && transfer.status === 'draft') {
      const session = await this.connection.startSession();
      session.startTransaction();
      try {
        for (const item of transfer.items) {
          await this.stockLedger.applyDelta({
            tenantId,
            storeId: fromStoreId,
            productId: item.productId.toString(),
            variantId: item.variantId?.toString() || null,
            quantity: -item.quantity,
            type: 'transfer_out',
            reason: `Transfer ${transfer.transferNumber}`,
            referenceId: transfer._id.toString(),
            userId,
            warehouseId: transfer.fromWarehouseId.toString(),
            session,
          });
        }
        transfer.status = 'in_transit';
        transfer.items.forEach((i) => {
          i.status = 'sent';
        });
        await transfer.save({ session });
        await session.commitTransaction();
        await this.safeNotifyTransfer(tenantId, {
          transferNumber: transfer.transferNumber,
          status: 'shipped',
          fromWarehouse: transfer.fromWarehouseName,
          toWarehouse: transfer.toWarehouseName,
        });
        return transfer;
      } catch (err) {
        await session.abortTransaction();
        await this.safeNotifyTransfer(tenantId, {
          transferNumber: transfer.transferNumber,
          status: 'failed',
          fromWarehouse: transfer.fromWarehouseName,
          toWarehouse: transfer.toWarehouseName,
        });
        throw err;
      } finally {
        void session.endSession();
      }
    }

    if (status === 'completed' && transfer.status === 'in_transit') {
      const session = await this.connection.startSession();
      session.startTransaction();
      try {
        for (const item of transfer.items) {
          const destProductId = await this.resolveDestinationProductId(
            tenantId,
            fromStoreId,
            toStoreId,
            item.productId.toString(),
          );
          await this.stockLedger.applyDelta({
            tenantId,
            storeId: toStoreId,
            productId: destProductId,
            variantId: item.variantId?.toString() || null,
            quantity: item.quantity,
            type: 'transfer_in',
            reason: `Transfer ${transfer.transferNumber}`,
            referenceId: transfer._id.toString(),
            userId,
            warehouseId: transfer.toWarehouseId.toString(),
            session,
          });
        }
        transfer.status = 'completed';
        transfer.items.forEach((i) => {
          i.status = 'received';
        });
        await transfer.save({ session });
        await session.commitTransaction();
        await this.safeNotifyTransfer(tenantId, {
          transferNumber: transfer.transferNumber,
          status: 'received',
          fromWarehouse: transfer.fromWarehouseName,
          toWarehouse: transfer.toWarehouseName,
        });
        return transfer;
      } catch (err) {
        await session.abortTransaction();
        await this.safeNotifyTransfer(tenantId, {
          transferNumber: transfer.transferNumber,
          status: 'failed',
          fromWarehouse: transfer.fromWarehouseName,
          toWarehouse: transfer.toWarehouseName,
        });
        throw err;
      } finally {
        void session.endSession();
      }
    }

    throw new BadRequestException(`Cannot transition from ${transfer.status} to ${status}`);
  }

  private async safeNotifyTransfer(
    tenantId: string,
    data: {
      transferNumber: string;
      status: 'created' | 'shipped' | 'received' | 'failed';
      fromWarehouse?: string;
      toWarehouse?: string;
    },
  ) {
    try {
      await this.notificationsService.notifyTransferEvent(tenantId, data);
    } catch {
      // Notification delivery must not roll back a successful stock movement.
    }
  }

  // ── Batches ──

  async getBatches(tenantId: string, storeId: string, query: any): Promise<any> {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const filter: any = { tenantId, storeId };
    if (query.search) {
      filter.$or = [
        { batchNumber: { $regex: query.search, $options: 'i' } },
        { productName: { $regex: query.search, $options: 'i' } },
      ];
    }
    const data = await this.batchModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { data };
  }

  async createBatch(tenantId: string, storeId: string, dto: any): Promise<any> {
    const exists = await this.batchModel.findOne({
      tenantId,
      storeId,
      batchNumber: dto.batchNumber,
    });
    if (exists) throw new BadRequestException('Batch number already exists');
    await this.assertProductInStore(tenantId, storeId, String(dto.productId));
    if (dto.warehouseId) {
      const warehouse = await this.warehouseModel.findOne({
        _id: dto.warehouseId,
        tenantId,
        storeId,
        ...notDeletedFilter(),
      });
      if (!warehouse) throw new BadRequestException('Warehouse does not belong to this store');
    }
    return this.batchModel.create({
      batchNumber: dto.batchNumber,
      productId: dto.productId,
      productName: dto.productName || '',
      variantId: dto.variantId || null,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      quantity: this.normalizeCount(dto.quantity || 0, 'Batch quantity'),
      warehouseId: dto.warehouseId || null,
      tenantId,
      storeId,
    });
  }

  async updateBatch(tenantId: string, storeId: string, id: string, dto: any): Promise<any> {
    const update: any = {};
    if (dto.quantity !== undefined)
      update.quantity = this.normalizeCount(dto.quantity, 'Batch quantity');
    if (dto.expiryDate !== undefined)
      update.expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;
    const batch = await this.batchModel.findOneAndUpdate(
      { _id: id, tenantId, storeId },
      { $set: update },
      { new: true },
    );
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  // ── Cycle Counts ──

  async getCycleCounts(tenantId: string, storeId: string, query: any): Promise<any> {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const data = await this.cycleCountModel
      .find({ tenantId, storeId })
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { data };
  }

  async createCycleCount(
    tenantId: string,
    storeId: string,
    userId: string,
    dto: any,
  ): Promise<any> {
    // Auto-populate items from stock records
    const filter: any = { tenantId, storeId };
    if (dto.warehouseId) filter.warehouseId = dto.warehouseId;

    const stockRecords = await this.stockModel.find(filter).populate('productId', 'name').lean();
    const items = stockRecords.map((s: any) => ({
      productId: s.productId?._id || s.productId,
      productName: s.productId?.name || '',
      variantId: s.variantId || null,
      expectedQty: s.quantity || 0,
      countedQty: null,
    }));

    let warehouseName = '';
    if (dto.warehouseId) {
      const wh = await this.warehouseModel
        .findOne({
          _id: dto.warehouseId,
          tenantId,
          storeId,
          ...notDeletedFilter(),
        })
        .lean();
      warehouseName = wh?.name || '';
    }

    return this.cycleCountModel.create({
      name: dto.name,
      warehouseId: dto.warehouseId || null,
      warehouseName,
      status: 'pending',
      items,
      date: new Date(),
      createdBy: userId,
      tenantId,
      storeId,
    });
  }

  async submitCycleCount(
    tenantId: string,
    storeId: string,
    userId: string,
    id: string,
    dto: any,
  ): Promise<any> {
    const cycleCount = await this.cycleCountModel.findOne({ _id: id, tenantId, storeId });
    if (!cycleCount) throw new NotFoundException('Cycle count not found');
    if (cycleCount.status === 'completed')
      throw new BadRequestException('Cycle count already completed');

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      // Update counted quantities and create adjustments for variances
      for (const submittedItem of dto.items) {
        const storedItem: any = cycleCount.items.find(
          (item: any) =>
            item.productId.toString() === String(submittedItem.productId) &&
            String(item.variantId || '') === String(submittedItem.variantId || ''),
        );
        if (!storedItem) {
          throw new BadRequestException(
            'Submitted cycle count item was not part of the original count snapshot',
          );
        }
        const counted = this.normalizeCount(
          submittedItem.counted ?? submittedItem.countedQty,
          'Counted quantity',
        );
        const expected = this.normalizeCount(storedItem.expectedQty || 0, 'Expected quantity');
        const variance = counted - expected;
        if (variance !== 0) {
          const warehouseId =
            cycleCount.warehouseId || (await this.getDefaultWarehouse(tenantId, storeId, session));

          await this.stockLedger.applyDelta({
            tenantId,
            storeId,
            productId: String(submittedItem.productId),
            variantId: submittedItem.variantId ? String(submittedItem.variantId) : null,
            quantity: variance,
            type: 'adjustment',
            reason: `Cycle count: ${cycleCount.name}`,
            referenceId: cycleCount._id.toString(),
            userId,
            warehouseId: String(warehouseId),
            session,
          });
        }
      }

      cycleCount.status = 'completed';
      cycleCount.items = cycleCount.items.map((item: any) => {
        const submitted = dto.items.find(
          (i: any) =>
            String(i.productId) === item.productId.toString() &&
            String(i.variantId || '') === String(item.variantId || ''),
        );
        return {
          productId: item.productId,
          productName: item.productName,
          variantId: item.variantId || null,
          expectedQty: item.expectedQty,
          countedQty: submitted
            ? this.normalizeCount(submitted.counted ?? submitted.countedQty, 'Counted quantity')
            : item.countedQty,
        };
      });
      await cycleCount.save({ session });
      await session.commitTransaction();
      return cycleCount;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      void session.endSession();
    }
  }

  // ── Dead Stock ──

  async getDeadStock(tenantId: string, storeId: string, _query: any): Promise<any> {
    // Dead stock = movements with reason 'dead' or 'damaged' grouped
    const movements = await this.movementModel
      .find({ tenantId, storeId, reason: { $in: ['dead', 'damaged', 'Dead Stock', 'Damaged'] } })
      .populate('productId', 'name sku')
      .sort({ date: -1 })
      .limit(50)
      .lean();

    const data = movements.map((m: any) => ({
      _id: m._id,
      productName: m.productId?.name || '',
      sku: m.productId?.sku || '',
      quantity: Math.abs(m.quantity),
      reason: m.reason,
      date: m.date,
      type: m.reason === 'damaged' || m.reason === 'Damaged' ? 'damaged' : 'dead_stock',
    }));

    return { data };
  }

  // ── Reorder Alerts ──

  async getReorderAlerts(tenantId: string, storeId: string): Promise<any> {
    const alerts = await this.stockModel
      .find({
        tenantId,
        storeId,
        $expr: { $lte: ['$quantity', '$reorderPoint'] },
      })
      .populate('productId', 'name sku barcode')
      .lean();

    const data = alerts.map((s: any) => ({
      _id: s._id,
      name: s.productId?.name || '',
      sku: s.productId?.sku || '',
      currentStock: s.quantity,
      reorderPoint: s.reorderPoint,
    }));

    return { data };
  }

  // ── Helper ──

  private async getDefaultWarehouse(
    tenantId: string,
    storeId: string,
    session?: any,
  ): Promise<any> {
    let wh = await this.warehouseModel
      .findOne({ tenantId, storeId, code: 'DEFAULT' })
      .session(session || null);
    if (!wh) {
      const created = await this.warehouseModel.create(
        [{ name: 'Default Warehouse', code: 'DEFAULT', tenantId, storeId }],
        session ? { session } : {},
      );
      wh = created[0];
    }
    return wh._id;
  }
}
