import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { Expense, ExpenseDocument } from '../../database/schemas/expense.schema';
import { PurchaseOrder, PurchaseOrderDocument } from '../../database/schemas/purchase-order.schema';
import { CurrencyService } from './currency.service';

/** Local-amount field → base-amount field for each convertible collection. */
const SALE_FIELDS = {
  totalAmount: 'baseTotalAmount',
  subtotal: 'baseSubtotal',
  tax: 'baseTax',
  discount: 'baseDiscount',
};
const EXPENSE_FIELDS = { amount: 'baseAmount', tax: 'baseTax', total: 'baseTotal' };
const PURCHASE_FIELDS = {
  subtotal: 'baseSubtotal',
  taxTotal: 'baseTaxTotal',
  discount: 'baseDiscount',
  shipping: 'baseShipping',
  totalAmount: 'baseTotalAmount',
};

export interface BackfillResult {
  sales: number;
  expenses: number;
  purchases: number;
}

/**
 * Back-converts transactions that were recorded without an FX rate
 * (exchangeRateMissing: true) once a rate becomes available. Runs when an owner
 * adds a manual rate and daily after auto-FX. Idempotent: only touches flagged
 * records and only when a rate now exists for their currency.
 */
@Injectable()
export class CurrencyBackfillService {
  private readonly logger = new Logger(CurrencyBackfillService.name);

  constructor(
    @InjectModel(SaleOrder.name) private saleOrderModel: Model<SaleOrderDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(PurchaseOrder.name) private purchaseOrderModel: Model<PurchaseOrderDocument>,
    private currencyService: CurrencyService,
  ) {}

  async backfillTenant(tenantId: string): Promise<BackfillResult> {
    const base = await this.currencyService.resolveTenantBaseCurrency(tenantId);
    const tid = new Types.ObjectId(tenantId);

    const [sales, expenses, purchases] = await Promise.all([
      this.backfillCollection(this.saleOrderModel, tenantId, tid, base, SALE_FIELDS),
      this.backfillCollection(this.expenseModel, tenantId, tid, base, EXPENSE_FIELDS),
      this.backfillCollection(this.purchaseOrderModel, tenantId, tid, base, PURCHASE_FIELDS),
    ]);

    const result = { sales, expenses, purchases };
    if (sales + expenses + purchases > 0) {
      this.logger.log(`Backfilled base amounts for tenant ${tenantId}: ${JSON.stringify(result)}`);
    }
    return result;
  }

  private async backfillCollection(
    model: Model<any>,
    tenantId: string,
    tid: Types.ObjectId,
    base: string,
    fieldMap: Record<string, string>,
  ): Promise<number> {
    // Currencies still flagged as unconverted for this tenant/collection.
    const currencies: (string | null)[] = await model.distinct('currency', {
      tenantId: tid,
      exchangeRateMissing: true,
    });

    let updated = 0;
    for (const currency of currencies) {
      const normalized = (currency || base).toUpperCase();
      // Same-currency records convert 1:1; otherwise look up the best rate on file.
      let rate = 1;
      if (normalized !== base) {
        const rateDoc = await this.currencyService.findRate(tenantId, normalized, base, new Date());
        if (!rateDoc) continue; // no rate yet — leave flagged for a later run
        rate = Number(rateDoc.rate);
        if (!Number.isFinite(rate) || rate <= 0) continue;
      }
      updated += await this.applyRate(model, tid, currency, base, rate, fieldMap);
    }
    return updated;
  }

  private async applyRate(
    model: Model<any>,
    tid: Types.ObjectId,
    currency: string | null,
    base: string,
    rate: number,
    fieldMap: Record<string, string>,
  ): Promise<number> {
    const set: Record<string, any> = {
      exchangeRate: rate,
      exchangeRateMissing: false,
      baseCurrency: base,
    };
    for (const [local, baseField] of Object.entries(fieldMap)) {
      set[baseField] = { $round: [{ $multiply: [{ $ifNull: [`$${local}`, 0] }, rate] }, 2] };
    }
    // Aggregation-pipeline update so base fields are derived from the record's
    // own local amounts × the rate.
    const res = await model.updateMany({ tenantId: tid, currency, exchangeRateMissing: true }, [
      { $set: set },
    ]);
    return res.modifiedCount || 0;
  }
}
