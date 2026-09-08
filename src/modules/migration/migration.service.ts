import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ImportJob,
  ImportJobDocument,
  ImportDuplicateStrategy,
  ImportEntityType,
} from '../../database/schemas/import-job.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { Category, CategoryDocument } from '../../database/schemas/category.schema';
import { Supplier, SupplierDocument } from '../../database/schemas/supplier.schema';
import { Warehouse, WarehouseDocument } from '../../database/schemas/warehouse.schema';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { PurchaseOrder, PurchaseOrderDocument } from '../../database/schemas/purchase-order.schema';
import {
  PurchaseReturn,
  PurchaseReturnDocument,
} from '../../database/schemas/purchase-return.schema';
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from '../../database/schemas/supplier-invoice.schema';
import { Expense, ExpenseDocument } from '../../database/schemas/expense.schema';
import { ExchangeRate, ExchangeRateDocument } from '../../database/schemas/exchange-rate.schema';
import { Account, AccountDocument } from '../finance/schemas/account.schema';
import { JournalEntry, JournalEntryDocument } from '../finance/schemas/journal-entry.schema';
import { StockLedgerService } from '../../common/services/stock-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { notDeletedFilter, restoreUpdate } from '../../common/utils/soft-delete.util';
import { normalizeCurrencyCode } from '../../common/utils/currency.util';
import {
  autoDetectMapping,
  mapRow,
  parseBoolean,
  parseCsv,
  parseJsonRows,
  parseXlsxRows,
  parseNumber,
  slugify,
} from './migration.util';

type ParseInput = {
  tenantId: string;
  storeId: string;
  userId: string;
  entityType: ImportEntityType;
  format: 'csv' | 'json' | 'xlsx';
  content: string;
  fileName?: string;
  columnMapping?: Record<string, string>;
  duplicateStrategy?: ImportDuplicateStrategy;
};

@Injectable()
export class MigrationService {
  constructor(
    @InjectModel(ImportJob.name) private jobModel: Model<ImportJobDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Warehouse.name) private warehouseModel: Model<WarehouseDocument>,
    @InjectModel(SaleOrder.name) private saleOrderModel: Model<SaleOrderDocument>,
    @InjectModel(PurchaseOrder.name) private purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(PurchaseReturn.name) private purchaseReturnModel: Model<PurchaseReturnDocument>,
    @InjectModel(SupplierInvoice.name) private supplierInvoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(ExchangeRate.name) private exchangeRateModel: Model<ExchangeRateDocument>,
    @InjectModel(Account.name) private accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name) private journalEntryModel: Model<JournalEntryDocument>,
    private stockLedger: StockLedgerService,
    private notificationsService: NotificationsService,
  ) {}

  async parseFile(input: ParseInput) {
    const rows =
      input.format === 'json'
        ? parseJsonRows(input.content)
        : input.format === 'xlsx'
          ? await parseXlsxRows(input.content)
          : parseCsv(input.content);
    if (!rows.length) throw new BadRequestException('No data rows found in file');

    const headers = Object.keys(rows[0]);
    const columnMapping =
      input.columnMapping && Object.keys(input.columnMapping).length
        ? input.columnMapping
        : autoDetectMapping(input.entityType, headers);

    const preview = this.buildPreview(input.entityType, rows, columnMapping);

    const job = await this.jobModel.create({
      tenantId: new Types.ObjectId(input.tenantId),
      storeId: new Types.ObjectId(input.storeId),
      createdBy: new Types.ObjectId(input.userId),
      entityType: input.entityType,
      format: input.format,
      duplicateStrategy: input.duplicateStrategy || 'skip',
      columnMapping,
      status: 'preview',
      rows,
      previewSample: preview.sample,
      rowErrors: preview.errors,
      stats: {
        total: rows.length,
        created: 0,
        updated: 0,
        restored: 0,
        skipped: 0,
        failed: preview.errors.length,
      },
      fileName: input.fileName || 'import',
    });

    return {
      jobId: job._id.toString(),
      entityType: job.entityType,
      format: job.format,
      columnMapping: job.columnMapping,
      headers,
      stats: job.stats,
      previewSample: job.previewSample,
      errors: job.rowErrors,
      helpText: this.helpText(input.entityType),
    };
  }

  async getJob(tenantId: string, storeId: string, jobId: string) {
    const job = await this.jobModel
      .findOne({
        _id: new Types.ObjectId(jobId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .lean();
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  async listJobs(tenantId: string, storeId: string) {
    const jobs = await this.jobModel
      .find({ tenantId: new Types.ObjectId(tenantId), storeId: new Types.ObjectId(storeId) })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-rows')
      .lean();
    return { data: jobs };
  }

  async runJob(tenantId: string, storeId: string, userId: string, jobId: string) {
    const job = await this.jobModel.findOne({
      _id: new Types.ObjectId(jobId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status === 'running') throw new BadRequestException('Import already running');
    if (job.status === 'completed') throw new BadRequestException('Import already completed');

    const startIndex = Math.max(0, Number((job as any).processedRows || 0));
    job.status = 'running';
    job.progress = Math.round((startIndex / job.rows.length) * 100);
    job.startedAt = (job as any).startedAt || new Date();
    await job.save();

    const stats = {
      total: job.rows.length,
      created: job.stats?.created || 0,
      updated: job.stats?.updated || 0,
      restored: job.stats?.restored || 0,
      skipped: job.stats?.skipped || 0,
      failed: job.stats?.failed || 0,
    };
    const rowErrors: { row: number; message: string }[] = [...(job.rowErrors || [])];

    try {
      for (let i = startIndex; i < job.rows.length; i++) {
        const rowNum = i + 2;
        const mapped = mapRow(job.rows[i], job.columnMapping);

        try {
          const result = await this.importRow(
            job.entityType,
            tenantId,
            storeId,
            mapped,
            job.duplicateStrategy,
          );
          stats[result.action]++;
        } catch (err: unknown) {
          stats.failed++;
          rowErrors.push({
            row: rowNum,
            message: err instanceof Error ? err.message : String(err),
          });
        }

        if (i % 10 === 0 || i === job.rows.length - 1) {
          job.progress = Math.round(((i + 1) / job.rows.length) * 100);
          (job as any).processedRows = i + 1;
          job.stats = stats;
          job.rowErrors = rowErrors;
          await job.save();
        }
      }

      job.status = stats.failed === job.rows.length ? 'failed' : 'completed';
      job.progress = 100;
      (job as any).processedRows = job.rows.length;
      (job as any).completedAt = new Date();
      job.stats = stats;
      job.rowErrors = rowErrors;
      await job.save();
      await this.safeNotifyImport(
        tenantId,
        job.entityType,
        job.status === 'completed' ? 'completed' : 'failed',
        stats,
      );

      return { jobId: job._id.toString(), status: job.status, stats, errors: rowErrors };
    } catch (err: unknown) {
      job.status = 'failed';
      (job as any).completedAt = new Date();
      await job.save();
      await this.safeNotifyImport(tenantId, job.entityType, 'failed', job.stats);
      throw err;
    }
  }

  private async safeNotifyImport(
    tenantId: string,
    entityType: string,
    status: 'completed' | 'failed',
    stats?: Partial<{ created: number; updated: number; failed: number }>,
  ) {
    try {
      await this.notificationsService.notifyImportEvent(tenantId, {
        entityType,
        status,
        created: stats?.created,
        updated: stats?.updated,
        failed: stats?.failed,
      });
    } catch {
      // Import results should not depend on notification delivery.
    }
  }

  private buildPreview(
    entityType: ImportEntityType,
    rows: Record<string, string>[],
    mapping: Record<string, string>,
  ) {
    const errors: { row: number; message: string }[] = [];
    const sample: Record<string, unknown>[] = [];

    rows.slice(0, 5).forEach((row, idx) => {
      const mapped = mapRow(row, mapping);
      const rowNum = idx + 2;
      const validationError = this.validateMappedRow(entityType, mapped);
      if (validationError) errors.push({ row: rowNum, message: validationError });
      sample.push({ ...mapped, _sourceRow: rowNum });
    });

    rows.slice(5).forEach((row, idx) => {
      const mapped = mapRow(row, mapping);
      const validationError = this.validateMappedRow(entityType, mapped);
      if (validationError) errors.push({ row: idx + 7, message: validationError });
    });

    return { sample, errors };
  }

  private validateMappedRow(
    entityType: ImportEntityType,
    mapped: Record<string, string>,
  ): string | null {
    switch (entityType) {
      case 'products':
        if (!mapped.name?.trim()) return 'Product name is required';
        if (!mapped.sku?.trim()) return 'SKU is required';
        if (parseNumber(mapped.price) < 0) return 'Price cannot be negative';
        if (parseNumber(mapped.costPrice) < 0) return 'Cost cannot be negative';
        if (parseNumber(mapped.stock) < 0) return 'Stock cannot be negative';
        return null;
      case 'customers':
        if (!mapped.name?.trim()) return 'Customer name is required';
        return null;
      case 'categories':
        if (!mapped.name?.trim()) return 'Category name is required';
        return null;
      case 'inventory':
        if (!mapped.sku?.trim()) return 'SKU is required for inventory update';
        if (parseNumber(mapped.stock) < 0) return 'Stock cannot be negative';
        if (parseNumber(mapped.reorderPoint) < 0) return 'Reorder point cannot be negative';
        return null;
      case 'suppliers':
        if (!mapped.name?.trim()) return 'Supplier name is required';
        return null;
      case 'warehouses':
        if (!mapped.name?.trim()) return 'Warehouse name is required';
        if (!mapped.code?.trim()) return 'Warehouse code is required';
        return null;
      case 'stock_movements':
        if (!mapped.sku?.trim()) return 'SKU is required';
        if (!mapped.type?.trim()) return 'Movement type is required';
        if (parseNumber(mapped.quantity) === 0) return 'Quantity must be non-zero';
        return null;
      case 'sales':
        if (!mapped.orderNumber?.trim()) return 'Sale order number is required';
        if (parseNumber(mapped.totalAmount) < 0) return 'Total cannot be negative';
        return null;
      case 'sale_returns':
        if (!mapped.orderNumber?.trim()) return 'Return number is required';
        if (parseNumber(mapped.totalAmount) < 0) return 'Return total cannot be negative';
        return null;
      case 'purchases':
        if (!mapped.poNumber?.trim()) return 'Purchase order number is required';
        if (!mapped.supplier?.trim()) return 'Supplier is required';
        if (parseNumber(mapped.totalAmount) < 0) return 'Purchase total cannot be negative';
        return null;
      case 'purchase_returns':
        if (!mapped.returnNumber?.trim()) return 'Purchase return number is required';
        if (!mapped.poNumber?.trim()) return 'Purchase order number is required';
        return null;
      case 'supplier_invoices':
        if (!mapped.invoiceNumber?.trim()) return 'Supplier invoice number is required';
        if (!mapped.poNumber?.trim()) return 'Purchase order number is required';
        return null;
      case 'supplier_payments':
        if (!mapped.invoiceNumber?.trim()) return 'Supplier invoice number is required';
        if (parseNumber(mapped.amount) <= 0) return 'Payment amount must be greater than zero';
        return null;
      case 'expenses':
        if (!mapped.expenseNumber?.trim()) return 'Expense number is required';
        if (parseNumber(mapped.amount) < 0) return 'Expense amount cannot be negative';
        return null;
      case 'accounts':
        if (!mapped.code?.trim()) return 'Account code is required';
        if (!mapped.name?.trim()) return 'Account name is required';
        if (!mapped.type?.trim()) return 'Account type is required';
        return null;
      case 'opening_balances':
        if (!mapped.accountCode?.trim()) return 'Account code is required';
        if (parseNumber(mapped.debit) < 0 || parseNumber(mapped.credit) < 0)
          return 'Debit/credit cannot be negative';
        return null;
      case 'exchange_rates':
        if (!mapped.fromCurrency?.trim()) return 'From currency is required';
        if (!mapped.toCurrency?.trim()) return 'To currency is required';
        if (parseNumber(mapped.rate) <= 0) return 'Exchange rate must be greater than zero';
        return null;
      default:
        return null;
    }
  }

  private async importRow(
    entityType: ImportEntityType,
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ): Promise<{ action: 'created' | 'updated' | 'restored' | 'skipped' }> {
    switch (entityType) {
      case 'products':
        return this.importProduct(tenantId, storeId, mapped, strategy);
      case 'customers':
        return this.importCustomer(tenantId, storeId, mapped, strategy);
      case 'categories':
        return this.importCategory(tenantId, mapped, strategy);
      case 'inventory':
        return this.importInventory(tenantId, storeId, mapped, strategy);
      case 'suppliers':
        return this.importSupplier(tenantId, storeId, mapped, strategy);
      case 'warehouses':
        return this.importWarehouse(tenantId, storeId, mapped, strategy);
      case 'stock_movements':
        return this.importStockMovement(tenantId, storeId, mapped);
      case 'sales':
        return this.importSale(tenantId, storeId, mapped, strategy);
      case 'sale_returns':
        return this.importSaleReturn(tenantId, storeId, mapped, strategy);
      case 'purchases':
        return this.importPurchase(tenantId, storeId, mapped, strategy);
      case 'purchase_returns':
        return this.importPurchaseReturn(tenantId, storeId, mapped, strategy);
      case 'supplier_invoices':
        return this.importSupplierInvoice(tenantId, storeId, mapped, strategy);
      case 'supplier_payments':
        return this.importSupplierPayment(tenantId, storeId, mapped);
      case 'expenses':
        return this.importExpense(tenantId, storeId, mapped, strategy);
      case 'accounts':
        return this.importAccount(tenantId, mapped, strategy);
      case 'opening_balances':
        return this.importOpeningBalance(tenantId, storeId, mapped);
      case 'exchange_rates':
        return this.importExchangeRate(tenantId, mapped, strategy);
      default:
        throw new BadRequestException(`Unsupported entity type: ${entityType}`);
    }
  }

  private async importProduct(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const err = this.validateMappedRow('products', mapped);
    if (err) throw new BadRequestException(err);

    const sku = mapped.sku.trim();
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);

    let categoryId: Types.ObjectId | null = null;
    if (mapped.category?.trim()) {
      const cat = await this.categoryModel.findOne({
        tenantId: tid,
        name: new RegExp(`^${escapeRegex(mapped.category.trim())}$`, 'i'),
        ...notDeletedFilter(),
      });
      if (cat) categoryId = cat._id;
    }

    const payload = {
      name: mapped.name.trim(),
      slug: slugify(mapped.name),
      sku,
      barcode: mapped.barcode?.trim() || '',
      description: mapped.description?.trim() || '',
      price: parseNumber(mapped.price),
      costPrice: parseNumber(mapped.costPrice),
      stock: parseNumber(mapped.stock),
      categoryId,
      isActive: parseBoolean(mapped.isActive, true),
    };

    const active = await this.productModel.findOne({
      tenantId: tid,
      storeId: sid,
      sku,
      ...notDeletedFilter(),
    });
    if (active) {
      if (strategy === 'skip') return { action: 'skipped' as const };
      await this.productModel.updateOne({ _id: active._id }, { $set: payload });
      return { action: 'updated' as const };
    }

    const deleted = await this.productModel.findOne({
      tenantId: tid,
      storeId: sid,
      sku,
      deletedAt: { $ne: null },
    });
    if (deleted) {
      if (strategy === 'restore' || strategy === 'update') {
        await this.productModel.updateOne(
          { _id: deleted._id },
          { ...restoreUpdate(), $set: payload },
        );
        return { action: 'restored' as const };
      }
      if (strategy === 'skip') return { action: 'skipped' as const };
    }

    await this.productModel.create({
      ...payload,
      tenantId: tid,
      storeId: sid,
      reorderPoint: 0,
      taxRate: 0,
      hasVariants: false,
    });
    return { action: 'created' as const };
  }

  private async importCustomer(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const err = this.validateMappedRow('customers', mapped);
    if (err) throw new BadRequestException(err);

    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const email = mapped.email?.trim() || '';
    const phone = mapped.phone?.trim() || '';

    const matchFilter: Record<string, unknown> = { tenantId: tid, storeId: sid };
    if (email) matchFilter.email = email;
    else if (phone) matchFilter.phone = phone;
    else matchFilter.name = mapped.name.trim();

    const payload = {
      name: mapped.name.trim(),
      email,
      phone,
      address: mapped.address?.trim() || '',
      notes: mapped.notes?.trim() || '',
      loyaltyPoints: parseNumber(mapped.loyaltyPoints),
    };

    const active = await this.customerModel.findOne({ ...matchFilter, ...notDeletedFilter() });
    if (active) {
      if (strategy === 'skip') return { action: 'skipped' as const };
      await this.customerModel.updateOne({ _id: active._id }, { $set: payload });
      return { action: 'updated' as const };
    }

    const deleted = await this.customerModel.findOne({ ...matchFilter, deletedAt: { $ne: null } });
    if (deleted && (strategy === 'restore' || strategy === 'update')) {
      await this.customerModel.updateOne(
        { _id: deleted._id },
        { ...restoreUpdate(), $set: payload },
      );
      return { action: 'restored' as const };
    }
    if (deleted && strategy === 'skip') return { action: 'skipped' as const };

    await this.customerModel.create({ ...payload, tenantId: tid, storeId: sid });
    return { action: 'created' as const };
  }

  private async importCategory(
    tenantId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const err = this.validateMappedRow('categories', mapped);
    if (err) throw new BadRequestException(err);

    const tid = new Types.ObjectId(tenantId);
    const name = mapped.name.trim();
    const slug = mapped.slug?.trim() ? slugify(mapped.slug) : slugify(name);

    const active = await this.categoryModel.findOne({ tenantId: tid, slug, ...notDeletedFilter() });
    if (active) {
      if (strategy === 'skip') return { action: 'skipped' as const };
      await this.categoryModel.updateOne({ _id: active._id }, { $set: { name } });
      return { action: 'updated' as const };
    }

    const deleted = await this.categoryModel.findOne({
      tenantId: tid,
      slug,
      deletedAt: { $ne: null },
    });
    if (deleted && (strategy === 'restore' || strategy === 'update')) {
      await this.categoryModel.updateOne(
        { _id: deleted._id },
        { ...restoreUpdate(), $set: { name } },
      );
      return { action: 'restored' as const };
    }
    if (deleted && strategy === 'skip') return { action: 'skipped' as const };

    await this.categoryModel.create({ name, slug, tenantId: tid });
    return { action: 'created' as const };
  }

  private async importInventory(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const err = this.validateMappedRow('inventory', mapped);
    if (err) throw new BadRequestException(err);

    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const sku = mapped.sku.trim();

    const product = await this.productModel.findOne({
      tenantId: tid,
      storeId: sid,
      sku,
      ...notDeletedFilter(),
    });
    if (!product) {
      const deleted = await this.productModel.findOne({
        tenantId: tid,
        storeId: sid,
        sku,
        deletedAt: { $ne: null },
      });
      if (deleted && strategy === 'restore') {
        await this.productModel.updateOne(
          { _id: deleted._id },
          {
            ...restoreUpdate(),
            $set: {
              stock: parseNumber(mapped.stock, deleted.stock),
              reorderPoint: mapped.reorderPoint
                ? parseNumber(mapped.reorderPoint)
                : deleted.reorderPoint,
            },
          },
        );
        return { action: 'restored' as const };
      }
      throw new BadRequestException(`Product with SKU "${sku}" not found`);
    }

    const updates: Record<string, number> = { stock: parseNumber(mapped.stock, product.stock) };
    if (mapped.reorderPoint) updates.reorderPoint = parseNumber(mapped.reorderPoint);

    await this.productModel.updateOne({ _id: product._id }, { $set: updates });
    return { action: 'updated' as const };
  }

  private async importSupplier(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const name = mapped.name.trim();
    const payload = {
      name,
      contact: mapped.contact?.trim() || '',
      email: mapped.email?.trim() || '',
      phone: mapped.phone?.trim() || '',
      address: mapped.address?.trim() || '',
      payableBalance: parseNumber(mapped.payableBalance),
      basePayableBalance: parseNumber(mapped.basePayableBalance ?? mapped.payableBalance),
      creditBalance: parseNumber(mapped.creditBalance),
      baseCreditBalance: parseNumber(mapped.baseCreditBalance ?? mapped.creditBalance),
      isActive: true,
    };
    const existing = await this.supplierModel.findOne({
      tenantId: tid,
      storeId: sid,
      name,
      ...notDeletedFilter(),
    });
    if (existing) {
      if (strategy === 'skip') return { action: 'skipped' as const };
      await this.supplierModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.supplierModel.create({ ...payload, tenantId: tid, storeId: sid });
    return { action: 'created' as const };
  }

  private async importWarehouse(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const code = mapped.code.trim().toUpperCase();
    const payload = {
      name: mapped.name.trim(),
      code,
      address: mapped.address?.trim() || '',
      isActive: true,
    };
    const existing = await this.warehouseModel.findOne({
      tenantId: tid,
      storeId: sid,
      code,
      ...notDeletedFilter(),
    });
    if (existing) {
      if (strategy === 'skip') return { action: 'skipped' as const };
      await this.warehouseModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.warehouseModel.create({ ...payload, tenantId: tid, storeId: sid });
    return { action: 'created' as const };
  }

  private async importStockMovement(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
  ) {
    const product = await this.findProductBySku(tenantId, storeId, mapped.sku);
    const warehouse = mapped.warehouseCode?.trim()
      ? await this.findWarehouseByCode(tenantId, storeId, mapped.warehouseCode)
      : null;
    const rawType = mapped.type.trim() as
      'in' | 'out' | 'adjustment' | 'transfer_in' | 'transfer_out';
    const qty = parseNumber(mapped.quantity);
    const signedQuantity = ['out', 'transfer_out'].includes(rawType)
      ? -Math.abs(qty)
      : rawType === 'adjustment'
        ? qty
        : Math.abs(qty);
    await this.stockLedger.applyDelta({
      tenantId,
      storeId,
      productId: product._id.toString(),
      quantity: signedQuantity,
      type: rawType,
      reason: `Historical import${mapped.reason ? `: ${mapped.reason}` : ''}`,
      warehouseId: warehouse?._id?.toString() || null,
    });
    return { action: 'created' as const };
  }

  private async importSale(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const orderNumber = mapped.orderNumber.trim();
    const existing = await this.saleOrderModel.findOne({
      tenantId: tid,
      storeId: sid,
      orderNumber,
    });
    if (existing) {
      if (strategy === 'skip') return { action: 'skipped' as const };
    }
    const rate = parseNumber(mapped.exchangeRate, 1) || 1;
    const totalAmount = parseNumber(mapped.totalAmount);
    const paidAmount = parseNumber(mapped.paidAmount, totalAmount);
    const currency = normalizeCurrencyCode(mapped.currency || 'USD');
    const payload = {
      orderNumber,
      invoiceNumber: orderNumber,
      type: 'sale',
      status: 'completed',
      paymentStatus: paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      date: this.parseImportDate(mapped.date),
      totalAmount,
      baseTotalAmount: this.toBase(totalAmount, rate),
      subtotal: parseNumber(mapped.subtotal, totalAmount),
      baseSubtotal: this.toBase(parseNumber(mapped.subtotal, totalAmount), rate),
      discount: parseNumber(mapped.discount),
      baseDiscount: this.toBase(parseNumber(mapped.discount), rate),
      tax: parseNumber(mapped.tax),
      baseTax: this.toBase(parseNumber(mapped.tax), rate),
      currency,
      baseCurrency: normalizeCurrencyCode(mapped.baseCurrency || currency),
      exchangeRate: rate,
      exchangeRateDate: this.parseImportDate(mapped.date),
      items: await this.parseSaleItems(tenantId, storeId, mapped.items, rate),
      payments:
        paidAmount > 0
          ? [
              {
                method: this.normalizePaymentMethod(mapped.paymentMethod),
                amount: paidAmount,
                baseAmount: this.toBase(paidAmount, rate),
                date: this.parseImportDate(mapped.date),
              },
            ]
          : [],
      tenantId: tid,
      storeId: sid,
    };
    if (existing) {
      await this.saleOrderModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.saleOrderModel.create(payload);
    return { action: 'created' as const };
  }

  private async importSaleReturn(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const orderNumber = mapped.orderNumber.trim();
    const existing = await this.saleOrderModel.findOne({
      tenantId: tid,
      storeId: sid,
      orderNumber,
    });
    if (existing && strategy === 'skip') return { action: 'skipped' as const };
    const original = mapped.returnRef?.trim()
      ? await this.saleOrderModel.findOne({
          tenantId: tid,
          storeId: sid,
          orderNumber: mapped.returnRef.trim(),
        })
      : null;
    const rate =
      parseNumber(mapped.exchangeRate, Number((original as any)?.exchangeRate ?? 1)) || 1;
    const amount = parseNumber(mapped.totalAmount);
    const payload = {
      orderNumber,
      invoiceNumber: orderNumber,
      type: 'return',
      status: 'refunded',
      paymentStatus: 'paid',
      date: this.parseImportDate(mapped.date),
      totalAmount: amount,
      baseTotalAmount: this.toBase(amount, rate),
      subtotal: amount,
      baseSubtotal: this.toBase(amount, rate),
      returnRef: original?._id ?? null,
      returnReason: mapped.reason || 'Historical import',
      currency: normalizeCurrencyCode(mapped.currency || (original as any)?.currency || 'USD'),
      baseCurrency: normalizeCurrencyCode(
        mapped.baseCurrency || (original as any)?.baseCurrency || mapped.currency || 'USD',
      ),
      exchangeRate: rate,
      exchangeRateDate: this.parseImportDate(mapped.date),
      items: [],
      payments: [
        {
          method: 'cash',
          amount,
          baseAmount: this.toBase(amount, rate),
          date: this.parseImportDate(mapped.date),
        },
      ],
      tenantId: tid,
      storeId: sid,
    };
    if (existing) {
      await this.saleOrderModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.saleOrderModel.create(payload);
    return { action: 'created' as const };
  }

  private async importPurchase(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const poNumber = mapped.poNumber.trim();
    const existing = await this.purchaseOrderModel.findOne({
      tenantId: tid,
      storeId: sid,
      poNumber,
    });
    if (existing && strategy === 'skip') return { action: 'skipped' as const };
    const supplier = await this.findOrCreateSupplier(tenantId, storeId, mapped.supplier);
    const warehouse = mapped.warehouseCode?.trim()
      ? await this.findWarehouseByCode(tenantId, storeId, mapped.warehouseCode)
      : null;
    const rate = parseNumber(mapped.exchangeRate, 1) || 1;
    const totalAmount = parseNumber(mapped.totalAmount);
    const payload = {
      poNumber,
      supplierId: supplier._id,
      warehouseId: warehouse?._id ?? null,
      items: await this.parsePurchaseItems(tenantId, storeId, mapped.items, rate),
      subtotal: parseNumber(mapped.subtotal, totalAmount),
      baseSubtotal: this.toBase(parseNumber(mapped.subtotal, totalAmount), rate),
      taxTotal: parseNumber(mapped.taxTotal),
      baseTaxTotal: this.toBase(parseNumber(mapped.taxTotal), rate),
      discount: parseNumber(mapped.discount),
      baseDiscount: this.toBase(parseNumber(mapped.discount), rate),
      shipping: parseNumber(mapped.shipping),
      baseShipping: this.toBase(parseNumber(mapped.shipping), rate),
      totalAmount,
      baseTotalAmount: this.toBase(totalAmount, rate),
      currency: normalizeCurrencyCode(mapped.currency || 'USD'),
      baseCurrency: normalizeCurrencyCode(mapped.baseCurrency || mapped.currency || 'USD'),
      exchangeRate: rate,
      exchangeRateDate: this.parseImportDate(mapped.date),
      status: mapped.status?.trim() || 'completed',
      tenantId: tid,
      storeId: sid,
    };
    if (existing) {
      await this.purchaseOrderModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.purchaseOrderModel.create(payload);
    return { action: 'created' as const };
  }

  private async importPurchaseReturn(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const returnNumber = mapped.returnNumber.trim();
    const existing = await this.purchaseReturnModel.findOne({
      tenantId: tid,
      storeId: sid,
      returnNumber,
    });
    if (existing && strategy === 'skip') return { action: 'skipped' as const };
    const po = await this.purchaseOrderModel.findOne({
      tenantId: tid,
      storeId: sid,
      poNumber: mapped.poNumber.trim(),
    });
    if (!po) throw new BadRequestException(`Purchase order "${mapped.poNumber}" not found`);
    const rate = parseNumber(mapped.exchangeRate, Number((po as any).exchangeRate ?? 1)) || 1;
    const totalAmount = parseNumber(mapped.totalAmount);
    const payload = {
      returnNumber,
      poId: po._id,
      supplierId: (po as any).supplierId,
      items: [],
      totalAmount,
      baseTotalAmount: this.toBase(totalAmount, rate),
      supplierCreditAmount: totalAmount,
      baseSupplierCreditAmount: this.toBase(totalAmount, rate),
      creditStatus: 'unapplied',
      status: 'completed',
      reason: mapped.reason || 'Historical import',
      date: this.parseImportDate(mapped.date),
      currency: normalizeCurrencyCode(mapped.currency || (po as any).currency || 'USD'),
      baseCurrency: normalizeCurrencyCode(
        mapped.baseCurrency || (po as any).baseCurrency || mapped.currency || 'USD',
      ),
      exchangeRate: rate,
      exchangeRateDate: this.parseImportDate(mapped.date),
      createdBy: new Types.ObjectId(),
      tenantId: tid,
      storeId: sid,
    };
    if (existing) {
      await this.purchaseReturnModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.purchaseReturnModel.create(payload);
    return { action: 'created' as const };
  }

  private async importSupplierInvoice(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const invoiceNumber = mapped.invoiceNumber.trim();
    const existing = await this.supplierInvoiceModel.findOne({
      tenantId: tid,
      storeId: sid,
      invoiceNumber,
    });
    if (existing && strategy === 'skip') return { action: 'skipped' as const };
    const po = await this.purchaseOrderModel.findOne({
      tenantId: tid,
      storeId: sid,
      poNumber: mapped.poNumber.trim(),
    });
    if (!po) throw new BadRequestException(`Purchase order "${mapped.poNumber}" not found`);
    const supplier = mapped.supplier?.trim()
      ? await this.findOrCreateSupplier(tenantId, storeId, mapped.supplier)
      : await this.supplierModel.findOne({ _id: (po as any).supplierId });
    const rate = parseNumber(mapped.exchangeRate, Number((po as any).exchangeRate ?? 1)) || 1;
    const totalAmount = parseNumber(mapped.totalAmount);
    const paidAmount = parseNumber(mapped.paidAmount);
    const payload = {
      invoiceNumber,
      poId: po._id,
      supplierId: supplier!._id,
      amount: totalAmount,
      baseAmount: this.toBase(totalAmount, rate),
      totalAmount,
      baseTotalAmount: this.toBase(totalAmount, rate),
      paidAmount,
      basePaidAmount: this.toBase(paidAmount, rate),
      balanceDue: Math.max(0, totalAmount - paidAmount),
      baseBalanceDue: this.toBase(Math.max(0, totalAmount - paidAmount), rate),
      invoiceDate: this.parseImportDate(mapped.invoiceDate),
      dueDate: mapped.dueDate ? this.parseImportDate(mapped.dueDate) : null,
      status: paidAmount >= totalAmount ? 'paid' : 'verified',
      paymentStatus: paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      currency: normalizeCurrencyCode(mapped.currency || (po as any).currency || 'USD'),
      baseCurrency: normalizeCurrencyCode(
        mapped.baseCurrency || (po as any).baseCurrency || mapped.currency || 'USD',
      ),
      exchangeRate: rate,
      exchangeRateDate: this.parseImportDate(mapped.invoiceDate),
      payments: [],
      tenantId: tid,
      storeId: sid,
    };
    if (existing) {
      await this.supplierInvoiceModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.supplierInvoiceModel.create(payload);
    return { action: 'created' as const };
  }

  private async importSupplierPayment(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const invoice = await this.supplierInvoiceModel.findOne({
      tenantId: tid,
      storeId: sid,
      invoiceNumber: mapped.invoiceNumber.trim(),
    });
    if (!invoice)
      throw new BadRequestException(`Supplier invoice "${mapped.invoiceNumber}" not found`);
    const amount = parseNumber(mapped.amount);
    const rate = Number((invoice as any).exchangeRate ?? 1) || 1;
    const paidAmount = Number((invoice as any).paidAmount ?? 0) + amount;
    const totalAmount = Number((invoice as any).totalAmount ?? 0);
    await this.supplierInvoiceModel.updateOne(
      { _id: invoice._id },
      {
        $push: {
          payments: {
            amount,
            baseAmount: this.toBase(amount, rate),
            method: mapped.method || 'cash',
            reference: mapped.reference || '',
            paidAt: this.parseImportDate(mapped.paidAt),
          },
        },
        $set: {
          paidAmount,
          basePaidAmount: this.toBase(paidAmount, rate),
          balanceDue: Math.max(0, totalAmount - paidAmount),
          baseBalanceDue: this.toBase(Math.max(0, totalAmount - paidAmount), rate),
          paymentStatus: paidAmount >= totalAmount ? 'paid' : 'partial',
          status: paidAmount >= totalAmount ? 'paid' : (invoice as any).status,
          paidAt:
            paidAmount >= totalAmount
              ? this.parseImportDate(mapped.paidAt)
              : (invoice as any).paidAt,
        },
      },
    );
    return { action: 'updated' as const };
  }

  private async importExpense(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const expenseNumber = mapped.expenseNumber.trim();
    const existing = await this.expenseModel.findOne({
      tenantId: tid,
      storeId: sid,
      expenseNumber,
    });
    if (existing && strategy === 'skip') return { action: 'skipped' as const };
    const rate = parseNumber(mapped.exchangeRate, 1) || 1;
    const amount = parseNumber(mapped.amount);
    const tax = parseNumber(mapped.tax);
    const total = parseNumber(mapped.total, amount + tax);
    const payload = {
      expenseNumber,
      date: this.parseImportDate(mapped.date),
      category: mapped.category || 'Imported Expense',
      amount,
      baseAmount: this.toBase(amount, rate),
      tax,
      baseTax: this.toBase(tax, rate),
      total,
      baseTotal: this.toBase(total, rate),
      paymentStatus: mapped.paymentStatus || 'paid',
      vendor: mapped.vendor || '',
      description: mapped.description || 'Historical import',
      reference: mapped.reference || expenseNumber,
      status: 'approved',
      currency: normalizeCurrencyCode(mapped.currency || 'USD'),
      baseCurrency: normalizeCurrencyCode(mapped.baseCurrency || mapped.currency || 'USD'),
      exchangeRate: rate,
      exchangeRateDate: this.parseImportDate(mapped.date),
      tenantId: tid,
      storeId: sid,
    };
    if (existing) {
      await this.expenseModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.expenseModel.create(payload);
    return { action: 'created' as const };
  }

  private async importAccount(
    tenantId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const code = mapped.code.trim();
    const payload = {
      code,
      name: mapped.name.trim(),
      type: this.normalizeAccountType(mapped.type),
      balance: parseNumber(mapped.balance),
      isActive: true,
      tenantId: tid,
    };
    const existing = await this.accountModel.findOne({ tenantId: tid, code });
    if (existing) {
      if (strategy === 'skip') return { action: 'skipped' as const };
      await this.accountModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.accountModel.create(payload);
    return { action: 'created' as const };
  }

  private async importOpeningBalance(
    tenantId: string,
    storeId: string,
    mapped: Record<string, string>,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const account = await this.accountModel.findOne({
      tenantId: tid,
      code: mapped.accountCode.trim(),
    });
    if (!account) throw new BadRequestException(`Account "${mapped.accountCode}" not found`);
    const offset = await this.ensureOpeningEquityAccount(tenantId);
    const debit = parseNumber(mapped.debit);
    const credit = parseNumber(mapped.credit);
    const amount = debit || credit;
    if (amount <= 0) throw new BadRequestException('Opening balance debit or credit is required');
    const entryNumber = `OB-${mapped.accountCode.trim()}-${Date.now()}`;
    await this.journalEntryModel.create({
      entryNumber,
      date: this.parseImportDate(mapped.date),
      description: mapped.description || `Opening balance import for ${mapped.accountCode}`,
      status: 'posted',
      autoPosted: true,
      sourceType: 'opening_balance_import',
      sourceId: entryNumber,
      reference: entryNumber,
      lines:
        debit > 0
          ? [
              { accountId: account._id, debit: amount, credit: 0, description: 'Opening balance' },
              {
                accountId: offset._id,
                debit: 0,
                credit: amount,
                description: 'Opening balance offset',
              },
            ]
          : [
              {
                accountId: offset._id,
                debit: amount,
                credit: 0,
                description: 'Opening balance offset',
              },
              { accountId: account._id, debit: 0, credit: amount, description: 'Opening balance' },
            ],
      postedAt: new Date(),
      tenantId: tid,
      storeId: sid,
    });
    await this.accountModel.updateOne({ _id: account._id }, { $inc: { balance: debit - credit } });
    await this.accountModel.updateOne({ _id: offset._id }, { $inc: { balance: credit - debit } });
    return { action: 'created' as const };
  }

  private async importExchangeRate(
    tenantId: string,
    mapped: Record<string, string>,
    strategy: ImportDuplicateStrategy,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const fromCurrency = normalizeCurrencyCode(mapped.fromCurrency);
    const toCurrency = normalizeCurrencyCode(mapped.toCurrency);
    const effectiveAt = this.parseImportDate(mapped.effectiveAt);
    const filter = { tenantId: tid, fromCurrency, toCurrency, effectiveAt };
    const payload = {
      fromCurrency,
      toCurrency,
      rate: parseNumber(mapped.rate),
      effectiveAt,
      isActive: true,
      source: 'historical_import',
      note: mapped.note || '',
      tenantId: tid,
    };
    const existing = await this.exchangeRateModel.findOne(filter);
    if (existing) {
      if (strategy === 'skip') return { action: 'skipped' as const };
      await this.exchangeRateModel.updateOne({ _id: existing._id }, { $set: payload });
      return { action: 'updated' as const };
    }
    await this.exchangeRateModel.create(payload);
    return { action: 'created' as const };
  }

  private async findProductBySku(tenantId: string, storeId: string, sku: string) {
    const product = await this.productModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      sku: sku.trim(),
      ...notDeletedFilter(),
    });
    if (!product) throw new BadRequestException(`Product with SKU "${sku}" not found`);
    return product;
  }

  private async findWarehouseByCode(tenantId: string, storeId: string, code: string) {
    const warehouse = await this.warehouseModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      code: code.trim().toUpperCase(),
      ...notDeletedFilter(),
    });
    if (!warehouse) throw new BadRequestException(`Warehouse "${code}" not found`);
    return warehouse;
  }

  private async findOrCreateSupplier(tenantId: string, storeId: string, name: string) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const supplierName = name.trim();
    let supplier = await this.supplierModel.findOne({
      tenantId: tid,
      storeId: sid,
      name: supplierName,
      ...notDeletedFilter(),
    });
    if (!supplier) {
      supplier = await this.supplierModel.create({
        name: supplierName,
        tenantId: tid,
        storeId: sid,
      });
    }
    return supplier;
  }

  private async parseSaleItems(
    tenantId: string,
    storeId: string,
    raw: string | undefined,
    rate: number,
  ) {
    const rows = this.parseItems(raw);
    const items: any[] = [];
    for (const row of rows) {
      if (!row.sku) continue;
      const product = await this.findProductBySku(tenantId, storeId, String(row.sku));
      const qty = parseNumber(String(row.quantity ?? row.qty ?? 1), 1);
      const price = parseNumber(String(row.price ?? row.unitPrice ?? product.price ?? 0));
      const unitCost = parseNumber(String(row.unitCost ?? row.cost ?? product.costPrice ?? 0));
      items.push({
        productId: product._id,
        productName: String(row.productName ?? row.name ?? product.name),
        quantity: qty,
        price,
        discount: parseNumber(String(row.discount ?? 0)),
        unitCost,
        lineCost: unitCost * qty,
        baseUnitCost: this.toBase(unitCost, rate),
        baseLineCost: this.toBase(unitCost * qty, rate),
        sku: product.sku,
        barcode: product.barcode || '',
      });
    }
    return items;
  }

  private async parsePurchaseItems(
    tenantId: string,
    storeId: string,
    raw: string | undefined,
    rate: number,
  ) {
    const rows = this.parseItems(raw);
    const items: any[] = [];
    for (const row of rows) {
      if (!row.sku) continue;
      const product = await this.findProductBySku(tenantId, storeId, String(row.sku));
      const qty = parseNumber(String(row.quantity ?? row.qty ?? 1), 1);
      const unitCost = parseNumber(String(row.unitCost ?? row.cost ?? product.costPrice ?? 0));
      items.push({
        productId: product._id,
        productName: String(row.productName ?? row.name ?? product.name),
        quantity: qty,
        unitCost,
        baseUnitCost: this.toBase(unitCost, rate),
        received: parseNumber(String(row.received ?? qty), qty),
        taxPercent: parseNumber(String(row.taxPercent ?? row.tax ?? 0)),
      });
    }
    return items;
  }

  private parseItems(raw: string | undefined): Record<string, unknown>[] {
    if (!raw?.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      return raw
        .split(';')
        .map((part) => {
          const [sku, quantity, price] = part.split('|').map((value) => value?.trim());
          return { sku, quantity, price, unitCost: price };
        })
        .filter((item) => item.sku);
    }
  }

  private async ensureOpeningEquityAccount(tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    let account = await this.accountModel.findOne({ tenantId: tid, code: '3999' });
    if (!account) {
      account = await this.accountModel.create({
        tenantId: tid,
        code: '3999',
        name: 'Opening Balance Equity',
        type: 'equity',
        balance: 0,
        isActive: true,
      });
    }
    return account;
  }

  private normalizePaymentMethod(value: string | undefined) {
    const method = (value || 'cash').trim().toLowerCase();
    return ['cash', 'card', 'mobile', 'bank_transfer', 'cheque', 'other'].includes(method)
      ? method
      : 'other';
  }

  private normalizeAccountType(value: string) {
    const type = value.trim().toLowerCase();
    if (['asset', 'liability', 'equity', 'revenue', 'expense'].includes(type)) return type;
    throw new BadRequestException(`Unsupported account type: ${value}`);
  }

  private parseImportDate(value: string | undefined): Date {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private toBase(amount: number, rate: number): number {
    return Math.round((Number(amount || 0) * Number(rate || 1) + Number.EPSILON) * 100) / 100;
  }

  helpText(entityType: ImportEntityType): string {
    const base =
      'Upload CSV or JSON. Column headers are auto-mapped when they match common POS export names. Use dry-run preview before importing.';
    const formats: Record<ImportEntityType, string> = {
      products:
        'Required: name, sku. Optional: price, costPrice, stock, barcode, category, description, active.',
      customers: 'Required: name. Optional: email, phone, address, loyaltyPoints, notes.',
      categories: 'Required: name. Optional: slug (auto-generated from name if omitted).',
      inventory:
        'Required: sku. Optional: stock, reorderPoint. Updates existing product stock by SKU.',
      suppliers:
        'Required: name. Optional: contact, email, phone, address, payableBalance, creditBalance.',
      warehouses: 'Required: name, code. Optional: address.',
      stock_movements: 'Required: sku, type, quantity. Optional: warehouseCode, reason, date.',
      sales:
        'Required: orderNumber, totalAmount. Optional: date, customer, items JSON, payments, currency, exchangeRate.',
      sale_returns:
        'Required: orderNumber, totalAmount. Optional: returnRef/original sale, date, reason.',
      purchases:
        'Required: poNumber, supplier, totalAmount. Optional: warehouseCode, items JSON, status, currency, exchangeRate.',
      purchase_returns: 'Required: returnNumber, poNumber. Optional: totalAmount, reason, date.',
      supplier_invoices:
        'Required: invoiceNumber, poNumber. Optional: totalAmount, paidAmount, dueDate.',
      supplier_payments: 'Required: invoiceNumber, amount. Optional: method, reference, paidAt.',
      expenses:
        'Required: expenseNumber, amount. Optional: category, tax, total, vendor, description.',
      accounts: 'Required: code, name, type. Optional: balance.',
      opening_balances:
        'Required: accountCode and debit or credit. Creates a balanced posted journal against Opening Balance Equity.',
      exchange_rates: 'Required: fromCurrency, toCurrency, rate. Optional: effectiveAt, note.',
    };
    return `${base} ${formats[entityType]} Duplicate handling: skip (default), update existing, or restore soft-deleted records.`;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
