import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HeldOrder, HeldOrderDocument } from '../../database/schemas/held-order.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Category, CategoryDocument } from '../../database/schemas/category.schema';
import { Brand, BrandDocument } from '../../database/schemas/brand.schema';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { Supplier, SupplierDocument } from '../../database/schemas/supplier.schema';
import { Unit, UnitDocument } from '../../database/schemas/unit.schema';
import { Warehouse, WarehouseDocument } from '../../database/schemas/warehouse.schema';
import { AutomationRunnerService } from './automation-runner.service';
import {
  heldOrderMaxAgeDays,
  isAutomationEnabled,
  softDeleteRetentionDays,
} from './automation.util';

@Injectable()
export class DataHygieneScheduler {
  private readonly logger = new Logger(DataHygieneScheduler.name);

  constructor(
    @InjectModel(HeldOrder.name) private heldOrderModel: Model<HeldOrderDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Brand.name) private brandModel: Model<BrandDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Unit.name) private unitModel: Model<UnitDocument>,
    @InjectModel(Warehouse.name) private warehouseModel: Model<WarehouseDocument>,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 2 * * *', { name: 'held-order-cleanup', timeZone: 'UTC' })
  async cleanupHeldOrders(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('held-order-cleanup', () => this.runHeldOrderCleanup());
  }

  @Cron('0 3 * * 0', { name: 'soft-delete-purge', timeZone: 'UTC' })
  async purgeSoftDeleted(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('soft-delete-purge', () => this.runSoftDeletePurge());
  }

  private async runHeldOrderCleanup(): Promise<{
    summary: string;
    processed: number;
  }> {
    const maxAgeDays = heldOrderMaxAgeDays();
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000);

    const result = await this.heldOrderModel.deleteMany({
      status: 'held',
      createdAt: { $lt: cutoff },
    });

    return {
      summary: `Removed ${result.deletedCount} held order(s) older than ${maxAgeDays} days`,
      processed: result.deletedCount ?? 0,
    };
  }

  private async runSoftDeletePurge(): Promise<{
    summary: string;
    processed: number;
  }> {
    const retentionDays = softDeleteRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const filter = { deletedAt: { $ne: null, $lt: cutoff } };

    const models: Array<{ name: string; model: Model<{ deletedAt?: Date | null }> }> = [
      { name: 'products', model: this.productModel },
      { name: 'categories', model: this.categoryModel },
      { name: 'brands', model: this.brandModel },
      { name: 'customers', model: this.customerModel },
      { name: 'suppliers', model: this.supplierModel },
      { name: 'units', model: this.unitModel },
      { name: 'warehouses', model: this.warehouseModel },
    ];

    let total = 0;
    const parts: string[] = [];

    for (const { name, model } of models) {
      const result = await model.deleteMany(filter);
      const count = result.deletedCount ?? 0;
      if (count > 0) {
        parts.push(`${name}:${count}`);
        total += count;
      }
    }

    return {
      summary:
        total > 0
          ? `Purged ${total} record(s) (${parts.join(', ')}) older than ${retentionDays} days`
          : `No soft-deleted records past ${retentionDays}-day retention`,
      processed: total,
    };
  }
}
