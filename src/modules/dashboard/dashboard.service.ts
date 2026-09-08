import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { PurchaseOrder, PurchaseOrderDocument } from '../../database/schemas/purchase-order.schema';
import { Expense, ExpenseDocument } from '../../database/schemas/expense.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { Supplier, SupplierDocument } from '../../database/schemas/supplier.schema';
import { Category, CategoryDocument } from '../../database/schemas/category.schema';
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from '../../database/schemas/supplier-invoice.schema';
import { Stock, StockDocument } from '../../database/schemas/stock.schema';
import {
  PurchaseReturn,
  PurchaseReturnDocument,
} from '../../database/schemas/purchase-return.schema';
import { roundMoney } from '../../common/utils/money.util';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(SaleOrder.name) private saleOrderModel: Model<SaleOrderDocument>,
    @InjectModel(PurchaseOrder.name) private purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(SupplierInvoice.name) private supplierInvoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(Stock.name) private stockModel: Model<StockDocument>,
    @InjectModel(PurchaseReturn.name) private purchaseReturnModel: Model<PurchaseReturnDocument>,
  ) {}

  private parseDateRange(from?: string, to?: string): { start: Date; end: Date } | null {
    if (!from || !to) return null;
    const start = new Date(from);
    const end = new Date(to);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return { start, end };
  }

  private money(value: number) {
    return roundMoney(Number(value || 0));
  }

  private getPreviousPeriod(start: Date, end: Date): { prevStart: Date; prevEnd: Date } {
    const diff = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return { prevStart, prevEnd };
  }

  // ─── KPI (FIXED: Gross Profit now uses COGS) ───────────────────────

  async getKpi(tenantId: string, storeId: string, from?: string, to?: string) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const baseMatch = { tenantId: tenantObjId, storeId: storeObjId };

    const customRange = this.parseDateRange(from, to);
    const now = new Date();

    let startOfPeriod: Date;
    let endOfPeriod: Date;
    let startOfPrevPeriod: Date;
    let endOfPrevPeriod: Date;

    if (customRange) {
      startOfPeriod = customRange.start;
      endOfPeriod = customRange.end;
      const prev = this.getPreviousPeriod(startOfPeriod, endOfPeriod);
      startOfPrevPeriod = prev.prevStart;
      endOfPrevPeriod = prev.prevEnd;
    } else {
      startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
      endOfPeriod = now;
      startOfPrevPeriod = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endOfPrevPeriod = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    }

    const [currentSales, currentPurchases, currentExpenses, currentCOGS] = await Promise.all([
      this.aggregateSales(baseMatch, startOfPeriod, endOfPeriod),
      this.aggregatePurchases(baseMatch, startOfPeriod, endOfPeriod),
      this.aggregateExpenses(baseMatch, startOfPeriod, endOfPeriod),
      this.aggregateCOGS(tenantObjId, storeObjId, startOfPeriod, endOfPeriod),
    ]);

    const [prevSales, prevPurchases, prevExpenses, prevCOGS] = await Promise.all([
      this.aggregateSales(baseMatch, startOfPrevPeriod, endOfPrevPeriod),
      this.aggregatePurchases(baseMatch, startOfPrevPeriod, endOfPrevPeriod),
      this.aggregateExpenses(baseMatch, startOfPrevPeriod, endOfPrevPeriod),
      this.aggregateCOGS(tenantObjId, storeObjId, startOfPrevPeriod, endOfPrevPeriod),
    ]);

    const [invoiceDue, supplierPayables] = await Promise.all([
      this.getInvoiceDue(baseMatch),
      this.getSupplierPayables(baseMatch),
    ]);

    const totalSales = this.money(currentSales.sales - currentSales.returns);
    const totalSalesReturn = this.money(currentSales.returns);
    const totalPurchase = this.money(currentPurchases.purchases - currentPurchases.returns);
    const totalPurchaseReturn = this.money(currentPurchases.returns);
    const totalExpenses = this.money(currentExpenses);

    // Gross profit is calculated from net sales after returns, then subtracts COGS.
    const grossProfit = this.money(totalSales - currentCOGS);

    return {
      totalSales: {
        value: totalSales,
        change: this.calcChange(totalSales, this.money(prevSales.sales - prevSales.returns)),
      },
      totalSalesReturn: {
        value: totalSalesReturn,
        change: this.calcChange(totalSalesReturn, prevSales.returns),
      },
      totalPurchase: {
        value: totalPurchase,
        change: this.calcChange(
          totalPurchase,
          this.money(prevPurchases.purchases - prevPurchases.returns),
        ),
      },
      totalPurchaseReturn: {
        value: totalPurchaseReturn,
        change: this.calcChange(totalPurchaseReturn, prevPurchases.returns),
      },
      profit: {
        value: grossProfit,
        change: this.calcChange(
          grossProfit,
          this.money(prevSales.sales - prevSales.returns - prevCOGS),
        ),
      },
      invoiceDue: { value: invoiceDue, change: null },
      supplierPayables: { value: supplierPayables.balanceDue, change: null },
      totalExpenses: { value: totalExpenses, change: this.calcChange(totalExpenses, prevExpenses) },
      totalPaymentReturns: {
        value: totalSalesReturn,
        change: this.calcChange(totalSalesReturn, prevSales.returns),
      },
      financeHealth: {
        grossProfit,
        grossSales: this.money(currentSales.sales),
        netSales: totalSales,
        cogs: this.money(currentCOGS),
        netOperatingProfit: this.money(grossProfit - totalExpenses),
        receivablesDue: invoiceDue,
        supplierPayablesDue: supplierPayables.balanceDue,
        supplierOverdue: supplierPayables.overdue,
        expenseBasis: 'tax_inclusive',
        cogsBasis: 'sale_line_cost_snapshot',
      },
      period: { from: startOfPeriod.toISOString(), to: endOfPeriod.toISOString() },
    };
  }

  private async aggregateCOGS(
    tenantId: Types.ObjectId,
    storeId: Types.ObjectId,
    from: Date,
    to: Date,
  ): Promise<number> {
    const result = await this.saleOrderModel.aggregate([
      {
        $match: {
          tenantId,
          storeId,
          type: { $in: ['sale', 'return'] },
          status: { $ne: 'cancelled' },
          date: { $gte: from, $lte: to },
        },
      },
      { $unwind: '$items' },
      {
        $addFields: {
          lineCogs: {
            $ifNull: [
              '$items.baseLineCost',
              {
                $ifNull: [
                  '$items.lineCost',
                  {
                    $multiply: [
                      { $ifNull: ['$items.unitCost', 0] },
                      { $ifNull: ['$items.quantity', 0] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$type',
          totalCOGS: { $sum: '$lineCogs' },
        },
      },
    ]);

    let soldCOGS = 0;
    let returnedCOGS = 0;
    for (const row of result) {
      if (row._id === 'sale') soldCOGS = row.totalCOGS || 0;
      if (row._id === 'return') returnedCOGS = row.totalCOGS || 0;
    }
    return this.money(soldCOGS - returnedCOGS);
  }

  // ─── Sales Purchase Chart ───────────────────────────────────────────

  async getSalesPurchaseChart(
    tenantId: string,
    storeId: string,
    period: string,
    from?: string,
    to?: string,
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const baseMatch = { tenantId: tenantObjId, storeId: storeObjId };

    const customRange = this.parseDateRange(from, to);
    let startDate: Date;
    let groupBy: string;
    let labels: string[];

    if (customRange) {
      const diffMs = customRange.end.getTime() - customRange.start.getTime();
      const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      startDate = customRange.start;
      const endDate = customRange.end;
      if (diffDays <= 1) {
        groupBy = 'hour';
        labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      } else if (diffDays <= 31) {
        groupBy = 'day';
        labels = Array.from({ length: diffDays + 1 }, (_, i) => {
          const d = new Date(customRange.start);
          d.setDate(d.getDate() + i);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        });
      } else {
        groupBy = 'month';
        labels = this.getMonthLabelsRange(customRange.start, customRange.end);
      }

      const [salesData, purchaseData] = await Promise.all([
        this.chartAggregate(this.saleOrderModel, baseMatch, 'sale', startDate, groupBy, endDate),
        this.purchaseNetChartAggregate(baseMatch, startDate, groupBy, endDate),
      ]);

      const sales = labels.map((_, idx) => salesData.get(idx) || 0);
      const purchases = labels.map((_, idx) => purchaseData.get(idx) || 0);
      return {
        labels,
        sales,
        purchases,
        totalSales: this.money(sales.reduce((sum, value) => sum + value, 0)),
        totalPurchase: this.money(purchases.reduce((sum, value) => sum + value, 0)),
      };
    }

    const config = this.getPeriodConfig(period);
    startDate = config.startDate;
    groupBy = config.groupBy;
    labels = config.labels;
    const endDate = (config as any).endDate;

    const [salesData, purchaseData] = await Promise.all([
      this.chartAggregate(this.saleOrderModel, baseMatch, 'sale', startDate, groupBy, endDate),
      this.purchaseNetChartAggregate(baseMatch, startDate, groupBy, endDate),
    ]);

    const sales = labels.map((_, idx) => salesData.get(idx) || 0);
    const purchases = labels.map((_, idx) => purchaseData.get(idx) || 0);

    return {
      labels,
      sales,
      purchases,
      totalSales: this.money(sales.reduce((sum, value) => sum + value, 0)),
      totalPurchase: this.money(purchases.reduce((sum, value) => sum + value, 0)),
    };
  }

  // ─── Overview Counts ────────────────────────────────────────────────

  async getOverviewCounts(tenantId: string, storeId: string, from?: string, to?: string) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const customRange = this.parseDateRange(from, to);

    const baseFilter: any = { tenantId: tenantObjId, storeId: storeObjId };
    const dateFilter: any = customRange
      ? { ...baseFilter, createdAt: { $gte: customRange.start, $lte: customRange.end } }
      : baseFilter;

    const [suppliers, customers, saleOrders, purchaseOrders] = await Promise.all([
      this.supplierModel.countDocuments(dateFilter),
      this.customerModel.countDocuments(dateFilter),
      this.saleOrderModel.countDocuments(
        customRange
          ? {
              ...baseFilter,
              type: 'sale',
              status: { $ne: 'cancelled' },
              date: { $gte: customRange.start, $lte: customRange.end },
            }
          : { ...baseFilter, type: 'sale', status: { $ne: 'cancelled' } },
      ),
      this.purchaseOrderModel.countDocuments(
        customRange
          ? { ...baseFilter, createdAt: { $gte: customRange.start, $lte: customRange.end } }
          : baseFilter,
      ),
    ]);

    return { suppliers, customers, orders: saleOrders + purchaseOrders };
  }

  // ─── Customers Overview ─────────────────────────────────────────────

  async getCustomersOverview(
    tenantId: string,
    storeId: string,
    period: string,
    from?: string,
    to?: string,
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);

    let start: Date;
    let end: Date;
    const customRange = this.parseDateRange(from, to);
    if (customRange) {
      start = customRange.start;
      end = customRange.end;
    } else {
      const range = this.getDateRange(period);
      start = range.start;
      end = range.end;
    }

    const customersInPeriod = await this.saleOrderModel.distinct('customerId', {
      tenantId: tenantObjId,
      storeId: storeObjId,
      type: 'sale',
      status: { $ne: 'cancelled' },
      date: { $gte: start, $lte: end },
      customerId: { $ne: null },
    });

    if (customersInPeriod.length === 0) {
      return { firstTime: 0, returning: 0, firstTimeChange: null, returningChange: null };
    }

    const returningCustomers = await this.saleOrderModel.distinct('customerId', {
      tenantId: tenantObjId,
      storeId: storeObjId,
      type: 'sale',
      status: { $ne: 'cancelled' },
      date: { $lt: start },
      customerId: { $in: customersInPeriod },
    });

    const returning = returningCustomers.length;
    const firstTime = customersInPeriod.length - returning;

    return { firstTime, returning, firstTimeChange: null, returningChange: null };
  }

  // ─── Top Selling Products ──────────────────────────────────────────

  async getTopSellingProducts(
    tenantId: string,
    storeId: string,
    limit: number,
    from?: string,
    to?: string,
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const customRange = this.parseDateRange(from, to);

    const matchStage: any = {
      tenantId: tenantObjId,
      storeId: storeObjId,
      type: { $in: ['sale', 'return'] },
      status: { $ne: 'cancelled' },
    };
    if (customRange) {
      matchStage.date = { $gte: customRange.start, $lte: customRange.end };
    }

    const result = await this.saleOrderModel.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          totalSold: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'return'] },
                { $multiply: ['$items.quantity', -1] },
                '$items.quantity',
              ],
            },
          },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'return'] },
                {
                  $multiply: [
                    {
                      $multiply: [
                        {
                          $subtract: [
                            { $multiply: ['$items.quantity', '$items.price'] },
                            { $ifNull: ['$items.discount', 0] },
                          ],
                        },
                        { $ifNull: ['$exchangeRate', 1] },
                      ],
                    },
                    -1,
                  ],
                },
                {
                  $multiply: [
                    {
                      $subtract: [
                        { $multiply: ['$items.quantity', '$items.price'] },
                        { $ifNull: ['$items.discount', 0] },
                      ],
                    },
                    { $ifNull: ['$exchangeRate', 1] },
                  ],
                },
              ],
            },
          },
          productName: { $first: '$items.productName' },
        },
      },
      { $match: { totalSold: { $gt: 0 } } },
      { $sort: { totalSold: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ['$product.name', '$productName'] },
          sku: { $ifNull: ['$product.sku', ''] },
          image: { $ifNull: ['$product.image', ''] },
          totalSold: 1,
          revenue: 1,
        },
      },
    ]);

    return result;
  }

  // ─── Low Stock Products ────────────────────────────────────────────

  async getLowStockProducts(tenantId: string, storeId: string) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);

    const stocks = await this.stockModel
      .find({
        tenantId: tenantObjId,
        storeId: storeObjId,
        reorderPoint: { $gt: 0 },
        $expr: { $lte: ['$quantity', '$reorderPoint'] },
      })
      .populate('productId', 'name sku image isActive')
      .sort({ quantity: 1 })
      .limit(10)
      .lean();

    return stocks
      .filter((s: any) => s.productId?.isActive !== false)
      .map((s: any) => ({
        _id: s._id.toString(),
        name: s.productId?.name || 'Unknown product',
        productId: s.productId?.sku || '',
        image: s.productId?.image || '',
        stock: s.quantity,
        reorderPoint: s.reorderPoint,
      }));
  }

  // ─── Recent Sales ──────────────────────────────────────────────────

  async getRecentSales(
    tenantId: string,
    storeId: string,
    limit: number,
    from?: string,
    to?: string,
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const customRange = this.parseDateRange(from, to);

    const filter: any = {
      tenantId: tenantObjId,
      storeId: storeObjId,
      type: 'sale',
      status: { $ne: 'cancelled' },
    };
    if (customRange) {
      filter.date = { $gte: customRange.start, $lte: customRange.end };
    }

    const orders = await this.saleOrderModel
      .find(filter)
      .sort({ date: -1 })
      .limit(limit)
      .populate('customerId', 'name')
      .lean();

    return orders.map((order) => {
      const firstItem = order.items?.[0];
      return {
        _id: order._id.toString(),
        orderNumber: order.orderNumber,
        productName: firstItem?.productName || 'N/A',
        category: firstItem?.categoryName || '',
        itemCount: order.items?.length || 0,
        price: (order as any).baseTotalAmount ?? order.totalAmount,
        date: order.date,
        status: order.status,
      };
    });
  }

  // ─── Sales Statistics ──────────────────────────────────────────────

  async getSalesStatistics(
    tenantId: string,
    storeId: string,
    from?: string,
    to?: string,
    year?: number,
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);

    const customRange = this.parseDateRange(from, to);
    let start: Date;
    let end: Date;
    let labels: string[];
    let groupBy: 'hour' | 'day' | 'month';

    if (customRange) {
      start = customRange.start;
      end = customRange.end;
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      if (diffDays <= 1) {
        groupBy = 'hour';
        labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      } else if (diffDays <= 31) {
        groupBy = 'day';
        labels = Array.from({ length: diffDays + 1 }, (_, i) => {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        });
      } else {
        groupBy = 'month';
        labels = this.getMonthLabelsRange(start, end);
      }
    } else {
      const y = year ?? new Date().getFullYear();
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31, 23, 59, 59, 999);
      groupBy = 'month';
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }

    const [revenueMap, expenseMap] = await Promise.all([
      this.statisticsSalesNetAggregate(
        { tenantId: tenantObjId, storeId: storeObjId, status: { $ne: 'cancelled' } },
        start,
        end,
        groupBy,
        !customRange,
      ),
      this.statisticsAggregate(
        this.expenseModel,
        { tenantId: tenantObjId, storeId: storeObjId },
        'date',
        start,
        end,
        groupBy,
        'baseTotal',
        !customRange,
      ),
    ]);

    const revenue = labels.map((_, idx) => revenueMap.get(idx) || 0);
    const expense = labels.map((_, idx) => expenseMap.get(idx) || 0);

    return {
      labels,
      revenue,
      expense,
      totalRevenue: this.money(revenue.reduce((a, b) => a + b, 0)),
      totalExpense: this.money(expense.reduce((a, b) => a + b, 0)),
    };
  }

  // ─── Recent Transactions ───────────────────────────────────────────

  async getRecentTransactions(
    tenantId: string,
    storeId: string,
    type: string,
    limit: number,
    from?: string,
    to?: string,
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const customRange = this.parseDateRange(from, to);

    if (type === 'expenses') {
      const filter: any = { tenantId: tenantObjId, storeId: storeObjId };
      if (customRange) filter.date = { $gte: customRange.start, $lte: customRange.end };

      const expenses = await this.expenseModel.find(filter).sort({ date: -1 }).limit(limit).lean();

      return expenses.map((e) => ({
        _id: e._id.toString(),
        date: e.date,
        customerName: e.description,
        status: 'paid',
        total: (e as any).total ?? e.amount,
      }));
    }

    const typeMap: Record<string, { model: string; typeFilter: string }> = {
      sale: { model: 'sale', typeFilter: 'sale' },
      purchase: { model: 'purchase', typeFilter: 'purchase' },
      quotation: { model: 'sale', typeFilter: 'sale' },
      invoices: { model: 'sale', typeFilter: 'sale' },
    };

    const config = typeMap[type] || typeMap.sale;

    if (config.model === 'purchase') {
      const filter: any = { tenantId: tenantObjId, storeId: storeObjId };
      if (customRange) filter.createdAt = { $gte: customRange.start, $lte: customRange.end };

      const orders = await this.purchaseOrderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return orders.map((o) => ({
        _id: o._id.toString(),
        date: (o as any).createdAt,
        customerName: o.poNumber,
        status: o.status,
        total: (o as any).baseTotalAmount ?? o.totalAmount,
      }));
    }

    const filter: any = {
      tenantId: tenantObjId,
      storeId: storeObjId,
      type: config.typeFilter,
      status: { $ne: 'cancelled' },
    };
    if (customRange) filter.date = { $gte: customRange.start, $lte: customRange.end };

    const orders = await this.saleOrderModel
      .find(filter)
      .sort({ date: -1 })
      .limit(limit)
      .populate('customerId', 'name')
      .lean();

    return orders.map((o) => ({
      _id: o._id.toString(),
      date: o.date,
      customerName: (o.customerId as any)?.name || o.orderNumber,
      customerId: o.orderNumber,
      status: o.status,
      total: (o as any).baseTotalAmount ?? o.totalAmount,
    }));
  }

  // ─── Top Customers ─────────────────────────────────────────────────

  async getTopCustomers(
    tenantId: string,
    storeId: string,
    limit: number,
    from?: string,
    to?: string,
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const customRange = this.parseDateRange(from, to);

    const matchStage: any = {
      tenantId: tenantObjId,
      storeId: storeObjId,
      type: { $in: ['sale', 'return'] },
      status: { $ne: 'cancelled' },
      customerId: { $ne: null },
    };
    if (customRange) {
      matchStage.date = { $gte: customRange.start, $lte: customRange.end };
    }

    const result = await this.saleOrderModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$customerId',
          totalSpend: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'return'] },
                { $multiply: [{ $abs: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } }, -1] },
                { $ifNull: ['$baseTotalAmount', '$totalAmount'] },
              ],
            },
          },
          orders: { $sum: { $cond: [{ $eq: ['$type', 'sale'] }, 1, 0] } },
        },
      },
      { $match: { totalSpend: { $gt: 0 } } },
      { $sort: { totalSpend: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ['$customer.name', 'Unknown'] },
          country: { $ifNull: ['$customer.country', ''] },
          orders: 1,
          totalSpend: 1,
        },
      },
    ]);

    return result;
  }

  // ─── Top Categories ────────────────────────────────────────────────

  async getTopCategories(tenantId: string, storeId: string, from?: string, to?: string) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const customRange = this.parseDateRange(from, to);

    const matchStage: any = {
      tenantId: tenantObjId,
      storeId: storeObjId,
      type: { $in: ['sale', 'return'] },
      status: { $ne: 'cancelled' },
    };
    if (customRange) {
      matchStage.date = { $gte: customRange.start, $lte: customRange.end };
    }

    const result = await this.saleOrderModel.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.categoryId',
          sales: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'return'] },
                { $multiply: ['$items.quantity', -1] },
                '$items.quantity',
              ],
            },
          },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'return'] },
                {
                  $multiply: [
                    {
                      $subtract: [
                        { $multiply: ['$items.quantity', '$items.price'] },
                        { $ifNull: ['$items.discount', 0] },
                      ],
                    },
                    -1,
                  ],
                },
                {
                  $subtract: [
                    { $multiply: ['$items.quantity', '$items.price'] },
                    { $ifNull: ['$items.discount', 0] },
                  ],
                },
              ],
            },
          },
        },
      },
      { $match: { revenue: { $gt: 0 } } },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ['$category.name', 'Uncategorized'] },
          sales: 1,
          revenue: 1,
        },
      },
    ]);

    const totalRevenue = result.reduce((sum, c) => sum + c.revenue, 0) || 1;
    const categories = result.map((c) => ({
      name: c.name,
      sales: c.sales,
      revenue: this.money(c.revenue),
      percentage: Math.round((c.revenue / totalRevenue) * 100),
    }));

    const [totalCategories, totalProducts] = await Promise.all([
      this.categoryModel.countDocuments({ tenantId: tenantObjId }),
      this.productModel.countDocuments({
        tenantId: tenantObjId,
        storeId: storeObjId,
        isActive: true,
      }),
    ]);

    return { categories, totalCategories, totalProducts };
  }

  // ─── Order Heatmap ─────────────────────────────────────────────────

  async getOrderHeatmap(
    tenantId: string,
    storeId: string,
    period: string,
    from?: string,
    to?: string,
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);

    let start: Date;
    let end: Date;
    const customRange = this.parseDateRange(from, to);
    if (customRange) {
      start = customRange.start;
      end = customRange.end;
    } else {
      const range = this.getDateRange(period);
      start = range.start;
      end = range.end;
    }

    const result = await this.saleOrderModel.aggregate([
      {
        $match: {
          tenantId: tenantObjId,
          storeId: storeObjId,
          type: 'sale',
          status: { $ne: 'cancelled' },
          date: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            dayOfWeek: { $dayOfWeek: '$date' },
            hour: { $hour: '$date' },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const hourSlots = [6, 8, 10, 12, 14, 16, 18, 20, 22];
    const grid: number[][] = Array.from({ length: 9 }, () => Array(7).fill(0));

    for (const r of result) {
      const dayIdx = r._id.dayOfWeek === 1 ? 6 : r._id.dayOfWeek - 2;
      const hour = r._id.hour;
      const rowIdx = hourSlots.findIndex((h) => hour >= h && hour < h + 2);
      if (rowIdx >= 0 && dayIdx >= 0 && dayIdx < 7) {
        grid[rowIdx][dayIdx] += r.count;
      }
    }

    return { grid };
  }

  // ─── Private helpers (unchanged) ───────────────────────────────────

  private async aggregateSales(baseMatch: any, from: Date, to: Date) {
    const result = await this.saleOrderModel.aggregate([
      { $match: { ...baseMatch, date: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
      {
        $addFields: {
          amountForDashboard: { $ifNull: ['$baseTotalAmount', '$totalAmount'] },
        },
      },
      {
        $group: {
          _id: '$type',
          total: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'return'] },
                { $abs: '$amountForDashboard' },
                '$amountForDashboard',
              ],
            },
          },
        },
      },
    ]);
    let sales = 0,
      returns = 0;
    for (const r of result) {
      if (r._id === 'sale') sales = r.total;
      if (r._id === 'return') returns = r.total;
    }
    return { sales, returns };
  }

  private async aggregatePurchases(baseMatch: any, from: Date, to: Date) {
    const [purchaseResult, returnResult] = await Promise.all([
      this.purchaseOrderModel.aggregate([
        {
          $match: {
            ...baseMatch,
            createdAt: { $gte: from, $lte: to },
            status: { $ne: 'cancelled' },
          },
        },
        {
          $group: { _id: null, total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } } },
        },
      ]),
      this.purchaseReturnModel.aggregate([
        { $match: { ...baseMatch, date: { $gte: from, $lte: to }, status: 'completed' } },
        {
          $group: { _id: null, total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } } },
        },
      ]),
    ]);
    return {
      purchases: this.money(purchaseResult[0]?.total || 0),
      returns: this.money(returnResult[0]?.total || 0),
    };
  }

  private async aggregateExpenses(baseMatch: any, from: Date, to: Date) {
    const result = await this.expenseModel.aggregate([
      { $match: { ...baseMatch, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$baseTotal', '$total'] } } } },
    ]);
    return result[0]?.total || 0;
  }

  private async getInvoiceDue(baseMatch: any) {
    const result = await this.saleOrderModel.aggregate([
      {
        $match: {
          ...baseMatch,
          type: 'sale',
          status: { $ne: 'cancelled' },
          paymentStatus: { $in: ['unpaid', 'partial'] },
        },
      },
      {
        $addFields: {
          paidAmountBase: { $sum: '$payments.baseAmount' },
          paidAmountLocal: { $sum: '$payments.amount' },
          totalForDashboard: { $ifNull: ['$baseTotalAmount', '$totalAmount'] },
        },
      },
      {
        $project: {
          balanceDue: {
            $max: [
              {
                $subtract: [
                  '$totalForDashboard',
                  {
                    $cond: [
                      { $ne: ['$baseTotalAmount', null] },
                      '$paidAmountBase',
                      '$paidAmountLocal',
                    ],
                  },
                ],
              },
              0,
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$balanceDue' } } },
    ]);
    return this.money(result[0]?.total || 0);
  }

  private async getSupplierPayables(baseMatch: any) {
    const now = new Date();
    const result = await this.supplierInvoiceModel.aggregate([
      { $match: { ...baseMatch, paymentStatus: { $in: ['unpaid', 'partial'] } } },
      {
        $group: {
          _id: null,
          balanceDue: { $sum: { $ifNull: ['$baseBalanceDue', '$balanceDue'] } },
          overdue: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', now] }] },
                { $ifNull: ['$baseBalanceDue', '$balanceDue'] },
                0,
              ],
            },
          },
        },
      },
    ]);
    return {
      balanceDue: result[0]?.balanceDue || 0,
      overdue: result[0]?.overdue || 0,
    };
  }

  private async chartAggregate(
    model: Model<any>,
    baseMatch: any,
    type: string,
    startDate: Date,
    groupBy: string,
    endDate?: Date,
  ) {
    const dateField = type === 'purchase' ? 'createdAt' : 'date';
    const dateFilter: any = endDate ? { $gte: startDate, $lte: endDate } : { $gte: startDate };

    const matchFilter: any = {
      ...baseMatch,
      status: { $ne: 'cancelled' },
      [dateField]: dateFilter,
    };
    if (type === 'sale') matchFilter.type = { $in: ['sale', 'return'] };
    else if (type !== 'purchase') matchFilter.type = type;
    const amountExpression = { $ifNull: ['$baseTotalAmount', '$totalAmount'] };
    const totalExpression =
      type === 'sale'
        ? {
            $cond: [
              { $eq: ['$type', 'return'] },
              { $multiply: [{ $abs: amountExpression }, -1] },
              amountExpression,
            ],
          }
        : amountExpression;

    let pipeline: any[];
    if (groupBy === 'hour') {
      pipeline = [
        { $match: matchFilter },
        { $group: { _id: { $hour: `$${dateField}` }, total: { $sum: totalExpression } } },
      ];
    } else if (groupBy === 'day' && endDate) {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $dateDiff: { startDate: startDate, endDate: `$${dateField}`, unit: 'day' } },
            total: { $sum: totalExpression },
          },
        },
      ];
    } else if (groupBy === 'month' && endDate) {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $dateDiff: { startDate: startDate, endDate: `$${dateField}`, unit: 'month' } },
            total: { $sum: totalExpression },
          },
        },
      ];
    } else if (groupBy === 'month') {
      pipeline = [
        { $match: matchFilter },
        { $group: { _id: { $month: `$${dateField}` }, total: { $sum: totalExpression } } },
      ];
    } else if (groupBy === 'week') {
      pipeline = [
        { $match: matchFilter },
        { $group: { _id: { $isoWeek: `$${dateField}` }, total: { $sum: totalExpression } } },
      ];
    } else {
      pipeline = [
        { $match: matchFilter },
        { $group: { _id: { $dayOfMonth: `$${dateField}` }, total: { $sum: totalExpression } } },
      ];
    }

    const result = await model.aggregate(pipeline);
    const map = new Map<number, number>();
    for (const r of result) {
      let key: number;
      if (groupBy === 'hour') {
        key = r._id;
      } else if ((groupBy === 'month' || groupBy === 'day' || groupBy === 'week') && !endDate) {
        key = r._id - 1;
      } else {
        key = r._id;
      }
      map.set(key, this.money((map.get(key) || 0) + r.total));
    }
    return map;
  }

  private async purchaseNetChartAggregate(
    baseMatch: any,
    startDate: Date,
    groupBy: string,
    endDate?: Date,
  ) {
    const [purchases, returns] = await Promise.all([
      this.chartAggregate(
        this.purchaseOrderModel,
        baseMatch,
        'purchase',
        startDate,
        groupBy,
        endDate,
      ),
      this.purchaseReturnChartAggregate(baseMatch, startDate, groupBy, endDate),
    ]);

    const map = new Map<number, number>();
    const keys = new Set([...purchases.keys(), ...returns.keys()]);
    for (const key of keys) {
      map.set(key, this.money((purchases.get(key) || 0) - (returns.get(key) || 0)));
    }
    return map;
  }

  private async purchaseReturnChartAggregate(
    baseMatch: any,
    startDate: Date,
    groupBy: string,
    endDate?: Date,
  ) {
    const dateFilter: any = endDate ? { $gte: startDate, $lte: endDate } : { $gte: startDate };
    const matchFilter: any = { ...baseMatch, status: 'completed', date: dateFilter };

    let pipeline: any[];
    if (groupBy === 'hour') {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $hour: '$date' },
            total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          },
        },
      ];
    } else if (groupBy === 'day' && endDate) {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $dateDiff: { startDate, endDate: '$date', unit: 'day' } },
            total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          },
        },
      ];
    } else if (groupBy === 'month' && endDate) {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $dateDiff: { startDate, endDate: '$date', unit: 'month' } },
            total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          },
        },
      ];
    } else if (groupBy === 'month') {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $month: '$date' },
            total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          },
        },
      ];
    } else if (groupBy === 'week') {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $isoWeek: '$date' },
            total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          },
        },
      ];
    } else {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $dayOfMonth: '$date' },
            total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          },
        },
      ];
    }

    const result = await this.purchaseReturnModel.aggregate(pipeline);
    const map = new Map<number, number>();
    for (const r of result) {
      const key =
        (groupBy === 'month' || groupBy === 'day' || groupBy === 'week') && !endDate
          ? r._id - 1
          : r._id;
      map.set(key, this.money((map.get(key) || 0) + r.total));
    }
    return map;
  }

  private async statisticsAggregate(
    model: Model<any>,
    match: any,
    dateField: string,
    start: Date,
    end: Date,
    groupBy: 'hour' | 'day' | 'month',
    sumField: string,
    calendarMonths = false,
  ): Promise<Map<number, number>> {
    const matchFilter = { ...match, [dateField]: { $gte: start, $lte: end } };
    const sumExpression =
      sumField === 'baseTotal' ? { $ifNull: ['$baseTotal', '$total'] } : `$${sumField}`;

    let pipeline: any[];
    if (groupBy === 'hour') {
      pipeline = [
        { $match: matchFilter },
        { $group: { _id: { $hour: `$${dateField}` }, total: { $sum: sumExpression } } },
      ];
    } else if (groupBy === 'day') {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $dateDiff: { startDate: start, endDate: `$${dateField}`, unit: 'day' } },
            total: { $sum: sumExpression },
          },
        },
      ];
    } else if (calendarMonths) {
      pipeline = [
        { $match: matchFilter },
        { $group: { _id: { $month: `$${dateField}` }, total: { $sum: sumExpression } } },
      ];
    } else {
      pipeline = [
        { $match: matchFilter },
        {
          $group: {
            _id: { $dateDiff: { startDate: start, endDate: `$${dateField}`, unit: 'month' } },
            total: { $sum: sumExpression },
          },
        },
      ];
    }

    const result = await model.aggregate(pipeline);
    const map = new Map<number, number>();
    for (const r of result) {
      const key =
        groupBy === 'hour' ? r._id : calendarMonths && groupBy === 'month' ? r._id - 1 : r._id;
      map.set(key, (map.get(key) || 0) + r.total);
    }
    return map;
  }

  private async statisticsSalesNetAggregate(
    match: any,
    start: Date,
    end: Date,
    groupBy: 'hour' | 'day' | 'month',
    calendarMonths = false,
  ): Promise<Map<number, number>> {
    const matchFilter = {
      ...match,
      type: { $in: ['sale', 'return'] },
      date: { $gte: start, $lte: end },
    };

    const amountExpression = { $ifNull: ['$baseTotalAmount', '$totalAmount'] };
    const signedTotal = {
      $cond: [
        { $eq: ['$type', 'return'] },
        { $multiply: [{ $abs: amountExpression }, -1] },
        amountExpression,
      ],
    };

    let groupId: any;
    if (groupBy === 'hour') groupId = { $hour: '$date' };
    else if (groupBy === 'day')
      groupId = { $dateDiff: { startDate: start, endDate: '$date', unit: 'day' } };
    else if (calendarMonths) groupId = { $month: '$date' };
    else groupId = { $dateDiff: { startDate: start, endDate: '$date', unit: 'month' } };

    const result = await this.saleOrderModel.aggregate([
      { $match: matchFilter },
      { $group: { _id: groupId, total: { $sum: signedTotal } } },
    ]);

    const map = new Map<number, number>();
    for (const r of result) {
      const key =
        groupBy === 'hour' ? r._id : calendarMonths && groupBy === 'month' ? r._id - 1 : r._id;
      map.set(key, this.money((map.get(key) || 0) + r.total));
    }
    return map;
  }

  private getPeriodConfig(period: string) {
    const now = new Date();
    switch (period) {
      case '1D': {
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
        return { startDate, groupBy: 'hour', labels };
      }
      case '1W': {
        const startDate = new Date(now);
        startDate.setDate(now.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        return {
          startDate,
          endDate: now,
          groupBy: 'day',
          labels: this.getDayLabelsRange(startDate, now),
        };
      }
      case '1M': {
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        return {
          startDate,
          endDate: now,
          groupBy: 'day',
          labels: Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`),
        };
      }
      case '3M': {
        const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { startDate, endDate: now, groupBy: 'month', labels: this.getMonthLabels(3, now) };
      }
      case '6M': {
        const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        return { startDate, endDate: now, groupBy: 'month', labels: this.getMonthLabels(6, now) };
      }
      default: {
        const startDate = new Date(now.getFullYear(), 0, 1);
        return {
          startDate,
          groupBy: 'month',
          labels: [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ],
        };
      }
    }
  }

  private getMonthLabels(count: number, now: Date): string[] {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const labels: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      labels.push(months[(now.getMonth() - i + 12) % 12]);
    }
    return labels;
  }

  private getMonthLabelsRange(start: Date, end: Date): string[] {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const labels: string[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      labels.push(months[current.getMonth()]);
      current.setMonth(current.getMonth() + 1);
    }
    return labels;
  }

  private getDayLabelsRange(start: Date, end: Date): string[] {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const labels: string[] = [];
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    while (current <= last) {
      labels.push(days[current.getDay()]);
      current.setDate(current.getDate() + 1);
    }
    return labels;
  }

  private getDateRange(period: string) {
    const now = new Date();
    let start: Date, end: Date;
    switch (period) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = now;
        break;
      case 'this_week': {
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        start = new Date(now);
        start.setDate(now.getDate() + diff);
        start.setHours(0, 0, 0, 0);
        end = now;
        break;
      }
      case 'last_week': {
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        start = new Date(now);
        start.setDate(now.getDate() + diff - 7);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = now;
    }
    return { start, end };
  }

  private calcChange(current: number, previous: number): number | null {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return current > 0 ? 100 : -100;
    return ((current - previous) / Math.abs(previous)) * 100;
  }
}
