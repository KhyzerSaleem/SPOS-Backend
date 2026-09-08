import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from '../../database/schemas/supplier-invoice.schema';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { Supplier, SupplierDocument } from '../../database/schemas/supplier.schema';
import { CurrencyService } from '../../common/services/currency.service';
import {
  safeBaseAmount,
  agingBucketForDays,
  daysOverdue,
  AGING_BUCKET_KEYS,
  AgingBucketKey,
} from '../../common/utils/currency-rollup.util';

export interface AgingRow {
  partyId: string;
  name: string;
  buckets: Record<AgingBucketKey, number>;
  total: number;
  excludedCount: number;
  oldestDaysOverdue: number;
}

function emptyBuckets(): Record<AgingBucketKey, number> {
  return { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
}

/**
 * Accounts receivable / payable aging and per-party statements.
 *
 * Kept as its own service (not folded into FinanceService) so the finance
 * module doesn't grow into the same god-service shape flagged elsewhere in
 * the codebase (e.g. admin.service.ts / pos.service.ts).
 */
@Injectable()
export class ArApService {
  constructor(
    @InjectModel(SaleOrder.name) private saleOrderModel: Model<SaleOrderDocument>,
    @InjectModel(SupplierInvoice.name) private supplierInvoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    private currencyService: CurrencyService,
  ) {}

  // ─── Accounts Receivable ────────────────────────────────────────────────

  async getReceivablesAging(tenantId: string, asOf: Date = new Date()) {
    const baseCurrency = await this.currencyService.resolveTenantBaseCurrency(tenantId);

    const openSales = await this.saleOrderModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        type: 'sale',
        paymentStatus: { $in: ['unpaid', 'partial'] },
        customerId: { $ne: null },
      })
      .select(
        'customerId totalAmount baseTotalAmount currency baseCurrency exchangeRateMissing payments date paymentDueDate orderNumber invoiceNumber',
      )
      .lean();

    const rowsByCustomer = new Map<string, AgingRow>();
    let excludedCount = 0;

    for (const sale of openSales as any[]) {
      const paidLocal = (sale.payments || []).reduce(
        (s: number, p: any) => s + (Number(p.amount) || 0),
        0,
      );
      const paidBase = (sale.payments || []).reduce(
        (s: number, p: any) => s + (Number(p.baseAmount) || 0),
        0,
      );
      const outstandingLocal = Math.max(0, (sale.totalAmount || 0) - paidLocal);
      if (outstandingLocal <= 0) continue;

      const outstandingBaseRaw = Math.max(0, (sale.baseTotalAmount || 0) - paidBase);
      const { amount, excluded } = safeBaseAmount(outstandingLocal, outstandingBaseRaw, sale);
      if (excluded) excludedCount += 1;

      const customerId = String(sale.customerId);
      const dueDate = sale.paymentDueDate || sale.date;
      const overdue = daysOverdue(new Date(dueDate), asOf);
      const bucket = agingBucketForDays(overdue);

      let row = rowsByCustomer.get(customerId);
      if (!row) {
        row = {
          partyId: customerId,
          name: '',
          buckets: emptyBuckets(),
          total: 0,
          excludedCount: 0,
          oldestDaysOverdue: overdue,
        };
        rowsByCustomer.set(customerId, row);
      }
      row.buckets[bucket] += amount;
      row.total += amount;
      if (excluded) row.excludedCount += 1;
      row.oldestDaysOverdue = Math.max(row.oldestDaysOverdue, overdue);
    }

    await this.attachNames(rowsByCustomer, this.customerModel);

    return this.buildAgingResponse(rowsByCustomer, baseCurrency, asOf, excludedCount);
  }

  async getCustomerStatement(tenantId: string, customerId: string, from?: string, to?: string) {
    const customer = await this.customerModel
      .findOne({ _id: new Types.ObjectId(customerId), tenantId: new Types.ObjectId(tenantId) })
      .select('name email phone creditLimit')
      .lean();
    if (!customer) throw new NotFoundException('Customer not found');

    const baseCurrency = await this.currencyService.resolveTenantBaseCurrency(tenantId);

    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const sales = await this.saleOrderModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        customerId: new Types.ObjectId(customerId),
        type: { $in: ['sale', 'return'] },
        ...(from || to ? { date: dateFilter } : {}),
      })
      .select(
        'orderNumber invoiceNumber totalAmount baseTotalAmount currency baseCurrency exchangeRateMissing payments date type',
      )
      .sort({ date: 1 })
      .lean();

    let runningBalance = 0;
    const lines = (sales as any[]).map((sale) => {
      const { amount: chargeBase } = safeBaseAmount(sale.totalAmount, sale.baseTotalAmount, sale);
      const paidBase = (sale.payments || []).reduce(
        (s: number, p: any) => s + (Number(p.baseAmount) || 0),
        0,
      );
      const paidLocal = (sale.payments || []).reduce(
        (s: number, p: any) => s + (Number(p.amount) || 0),
        0,
      );
      const { amount: paidBaseSafe } = safeBaseAmount(paidLocal, paidBase, sale);
      const net = chargeBase - paidBaseSafe;
      runningBalance += net;
      return {
        date: sale.date,
        type: sale.type,
        reference: sale.invoiceNumber || sale.orderNumber,
        charge: chargeBase,
        paid: paidBaseSafe,
        balance: runningBalance,
        currencyNote: sale.exchangeRateMissing
          ? 'Pending FX rate — excluded from base totals'
          : undefined,
      };
    });

    return {
      customer: {
        id: String(customer._id),
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      baseCurrency,
      lines,
      closingBalance: runningBalance,
    };
  }

  // ─── Accounts Payable ───────────────────────────────────────────────────

  async getPayablesAging(tenantId: string, asOf: Date = new Date()) {
    const baseCurrency = await this.currencyService.resolveTenantBaseCurrency(tenantId);

    const openInvoices = await this.supplierInvoiceModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        paymentStatus: { $in: ['unpaid', 'partial'] },
      })
      .select(
        'supplierId totalAmount baseTotalAmount balanceDue baseBalanceDue currency baseCurrency exchangeRateMissing invoiceDate dueDate invoiceNumber',
      )
      .lean();

    const rowsBySupplier = new Map<string, AgingRow>();
    let excludedCount = 0;

    for (const invoice of openInvoices as any[]) {
      if ((invoice.balanceDue || 0) <= 0) continue;
      const { amount, excluded } = safeBaseAmount(
        invoice.balanceDue,
        invoice.baseBalanceDue,
        invoice,
      );
      if (excluded) excludedCount += 1;

      const supplierId = String(invoice.supplierId);
      const dueDate = invoice.dueDate || invoice.invoiceDate;
      const overdue = daysOverdue(new Date(dueDate), asOf);
      const bucket = agingBucketForDays(overdue);

      let row = rowsBySupplier.get(supplierId);
      if (!row) {
        row = {
          partyId: supplierId,
          name: '',
          buckets: emptyBuckets(),
          total: 0,
          excludedCount: 0,
          oldestDaysOverdue: overdue,
        };
        rowsBySupplier.set(supplierId, row);
      }
      row.buckets[bucket] += amount;
      row.total += amount;
      if (excluded) row.excludedCount += 1;
      row.oldestDaysOverdue = Math.max(row.oldestDaysOverdue, overdue);
    }

    await this.attachNames(rowsBySupplier, this.supplierModel);

    return this.buildAgingResponse(rowsBySupplier, baseCurrency, asOf, excludedCount);
  }

  async getSupplierStatement(tenantId: string, supplierId: string, from?: string, to?: string) {
    const supplier = await this.supplierModel
      .findOne({ _id: new Types.ObjectId(supplierId), tenantId: new Types.ObjectId(tenantId) })
      .select('name email phone')
      .lean();
    if (!supplier) throw new NotFoundException('Supplier not found');

    const baseCurrency = await this.currencyService.resolveTenantBaseCurrency(tenantId);

    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const invoices = await this.supplierInvoiceModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        supplierId: new Types.ObjectId(supplierId),
        ...(from || to ? { invoiceDate: dateFilter } : {}),
      })
      .select(
        'invoiceNumber totalAmount baseTotalAmount paidAmount basePaidAmount balanceDue baseBalanceDue currency baseCurrency exchangeRateMissing invoiceDate',
      )
      .sort({ invoiceDate: 1 })
      .lean();

    let runningBalance = 0;
    const lines = (invoices as any[]).map((invoice) => {
      const { amount: chargeBase } = safeBaseAmount(
        invoice.totalAmount,
        invoice.baseTotalAmount,
        invoice,
      );
      const { amount: paidBase } = safeBaseAmount(
        invoice.paidAmount,
        invoice.basePaidAmount,
        invoice,
      );
      const net = chargeBase - paidBase;
      runningBalance += net;
      return {
        date: invoice.invoiceDate,
        reference: invoice.invoiceNumber,
        charge: chargeBase,
        paid: paidBase,
        balance: runningBalance,
        currencyNote: invoice.exchangeRateMissing
          ? 'Pending FX rate — excluded from base totals'
          : undefined,
      };
    });

    return {
      supplier: {
        id: String(supplier._id),
        name: supplier.name,
        email: supplier.email,
        phone: supplier.phone,
      },
      baseCurrency,
      lines,
      closingBalance: runningBalance,
    };
  }

  // ─── Shared helpers ─────────────────────────────────────────────────────

  private async attachNames(rows: Map<string, AgingRow>, model: Model<any>) {
    if (rows.size === 0) return;
    const ids = [...rows.keys()].map((id) => new Types.ObjectId(id));
    const parties = await model
      .find({ _id: { $in: ids } })
      .select('name')
      .lean();
    const nameById = new Map(parties.map((p: any) => [String(p._id), p.name]));
    for (const row of rows.values()) {
      row.name = nameById.get(row.partyId) || 'Unknown';
    }
  }

  private buildAgingResponse(
    rows: Map<string, AgingRow>,
    baseCurrency: string,
    asOf: Date,
    excludedCount: number,
  ) {
    const sortedRows = [...rows.values()].sort((a, b) => b.total - a.total);
    const totals = emptyBuckets();
    let grandTotal = 0;
    for (const row of sortedRows) {
      for (const key of AGING_BUCKET_KEYS) totals[key] += row.buckets[key];
      grandTotal += row.total;
    }
    return {
      baseCurrency,
      asOf,
      rows: sortedRows,
      totals: { ...totals, grandTotal },
      excludedCount,
      excludedNote:
        excludedCount > 0
          ? `${excludedCount} record(s) pending an FX rate are excluded from these totals until a rate is added in Settings.`
          : undefined,
    };
  }
}
