import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import {
  InvoiceCounter,
  InvoiceCounterDocument,
} from '../../database/schemas/invoice-counter.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../../database/schemas/product-variant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ProcessReturnDto, ReturnItemDto } from './dto/process-return.dto';
import { CreateBackOfficeSaleDto } from './dto/create-sale.dto';
import { allocateOrderNumber } from '../../common/utils/sale-order-number.util';
import { StockLedgerService } from '../../common/services/stock-ledger.service';
import { AuditService } from '../../common/services/audit.service';
import { WebhookDispatchService } from '../../common/services/webhook-dispatch.service';
import {
  calculateCartTotals,
  calculatePaymentSummary,
  roundMoney,
  normalizeQuantity,
} from '../../common/utils/money.util';
import { FinanceService } from '../finance/finance.service';
import { CurrencyService } from '../../common/services/currency.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(SaleOrder.name) private saleModel: Model<SaleOrderDocument>,
    @InjectModel(InvoiceCounter.name) private counterModel: Model<InvoiceCounterDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name) private variantModel: Model<ProductVariantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectConnection() private connection: Connection,
    private stockLedger: StockLedgerService,
    private auditService: AuditService,
    private webhookDispatch: WebhookDispatchService,
    private financeService: FinanceService,
    private currencyService: CurrencyService,
  ) {}

  private async postSaleJournal(
    tenantId: string,
    storeId: string,
    userId: string,
    sale: any,
    session: any,
  ) {
    const isReturn = sale.type === 'return';
    const total = Math.abs(roundMoney(Number(sale.baseTotalAmount ?? sale.totalAmount ?? 0)));
    const baseSubtotal = Number(sale.baseSubtotal ?? sale.subtotal ?? 0);
    const baseDiscount = Number(sale.baseDiscount ?? sale.discount ?? 0);
    const taxable = Math.abs(roundMoney(baseSubtotal - baseDiscount));
    const tax = Math.abs(roundMoney(Number(sale.baseTax ?? sale.tax ?? 0)));
    const cogs = roundMoney(
      (sale.items || []).reduce(
        (sum, item) => sum + Number(item.baseLineCost ?? item.lineCost ?? 0),
        0,
      ),
    );
    const paid = isReturn
      ? total
      : Math.min(
          total,
          roundMoney(
            (sale.payments || []).reduce(
              (sum, p) => sum + Number(p.baseAmount ?? p.amount ?? 0),
              0,
            ),
          ),
        );
    const balance = isReturn ? 0 : roundMoney(Math.max(0, total - paid));
    const lines: any[] = isReturn
      ? [
          { accountCode: '4100', debit: taxable, description: 'Sales return' },
          { accountCode: '2100', debit: tax, description: 'Tax reversed' },
          { accountCode: '1000', credit: total, description: 'Refund paid' },
        ]
      : [
          { accountCode: '1000', debit: paid, description: 'Sale payments' },
          { accountCode: '1100', debit: balance, description: 'Customer balance due' },
          { accountCode: '4000', credit: taxable, description: 'Sales revenue' },
          { accountCode: '2100', credit: tax, description: 'Sales tax payable' },
        ];
    if (cogs > 0) {
      lines.push(
        ...(isReturn
          ? [
              { accountCode: '1200', debit: cogs, description: 'Returned inventory cost' },
              { accountCode: '5000', credit: cogs, description: 'COGS reversed' },
            ]
          : [
              { accountCode: '5000', debit: cogs, description: 'Cost of goods sold' },
              { accountCode: '1200', credit: cogs, description: 'Inventory relieved' },
            ]),
      );
    }
    await this.financeService.postOperationalJournal({
      tenantId,
      storeId,
      userId,
      sourceType: isReturn ? 'sale_return' : 'sale',
      sourceId: sale._id.toString(),
      description: `${isReturn ? 'Sale return' : 'Sale'} ${sale.orderNumber}`,
      date: sale.date || new Date(),
      lines,
      session,
      sourceCurrency: sale.currency,
      baseCurrency: sale.baseCurrency,
      exchangeRate: sale.exchangeRate,
      exchangeRateDate: sale.exchangeRateDate,
    });
  }

  // ── List sales (paginated, filterable) ──

  async findAll(tenantId: string, storeId: string, query: any) {
    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };

    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.customerId) filter.customerId = new Types.ObjectId(query.customerId);

    if (query.search) {
      filter.$or = [
        { orderNumber: { $regex: query.search, $options: 'i' } },
        { invoiceNumber: { $regex: query.search, $options: 'i' } },
      ];
    }

    if (query.dateFrom || query.dateTo) {
      filter.date = {};
      if (query.dateFrom) filter.date.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.date.$lte = new Date(query.dateTo + 'T23:59:59.999Z');
    }

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.saleModel
        .find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'name email phone')
        .populate('cashierId', 'fullName email')
        .lean(),
      this.saleModel.countDocuments(filter),
    ]);

    return {
      data: data.map((s) => this.mapSale(s)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // ── Single sale detail ──

  async findOne(tenantId: string, storeId: string, id: string) {
    const sale = await this.saleModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .populate('customerId', 'name email phone address')
      .populate('cashierId', 'fullName email')
      .populate('returnRef', 'orderNumber invoiceNumber')
      .lean();

    if (!sale) throw new NotFoundException('Sale not found');
    return this.mapSale(sale);
  }

  // ── Create back-office sale ──

  async createSale(
    tenantId: string,
    storeId: string,
    userId: string,
    dto: CreateBackOfficeSaleDto,
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const tid = new Types.ObjectId(tenantId);
      const sid = new Types.ObjectId(storeId);
      const costByLine = new Map<
        string,
        { unitCost: number; lineCost: number; costSource: string }
      >();

      for (const item of dto.items) {
        const product = await this.productModel
          .findOne({ _id: new Types.ObjectId(item.productId), tenantId: tid, storeId: sid })
          .session(session)
          .lean();
        if (!product) throw new NotFoundException(`Product "${item.productName}" not found`);
        let unitCost = roundMoney((product as any).costPrice || 0);
        let costSource = 'product';
        if (item.variantId) {
          const variant = await this.variantModel
            .findOne({
              _id: new Types.ObjectId(item.variantId),
              tenantId: tid,
              storeId: sid,
              productId: product._id,
            })
            .session(session)
            .lean();
          if (variant) {
            unitCost = roundMoney((variant as any).costPrice ?? (variant as any).cost ?? unitCost);
            costSource = 'variant';
          }
        }
        const key = `${item.productId}:${item.variantId || ''}`;
        costByLine.set(key, {
          unitCost,
          lineCost: roundMoney(unitCost * normalizeQuantity(item.quantity)),
          costSource,
        });

        const available = await this.stockLedger.getAvailableQuantity(
          tenantId,
          storeId,
          item.productId,
          item.variantId || null,
          session,
        );
        if (available < item.quantity) {
          throw new BadRequestException(`Insufficient stock for "${item.productName}"`);
        }
      }

      const totals = calculateCartTotals({
        items: dto.items,
        globalDiscount: dto.discount || 0,
        discountType: 'flat',
        taxRate: 0,
      });
      const tax = roundMoney(dto.tax || 0);
      const total = roundMoney(totals.taxableBase + tax);
      const paymentSummary = calculatePaymentSummary(total, dto.payments || []);

      const orderNumber = await this.nextOrderNumber(tid, sid, session);
      const invoiceNumber = await this.nextInvoiceNumber(tid, sid, session);
      const currencySnapshot = await this.currencyService.resolveSnapshot(
        tenantId,
        storeId,
        new Date(),
      );

      const [sale] = await this.saleModel.create(
        [
          {
            orderNumber,
            invoiceNumber,
            totalAmount: total,
            currency: currencySnapshot.currency,
            baseCurrency: currencySnapshot.baseCurrency,
            exchangeRate: currencySnapshot.exchangeRate,
            exchangeRateDate: currencySnapshot.exchangeRateDate,
            baseTotalAmount: this.currencyService.toBase(total, currencySnapshot),
            subtotal: totals.subtotal,
            baseSubtotal: this.currencyService.toBase(totals.subtotal, currencySnapshot),
            discount: totals.discountAmount,
            baseDiscount: this.currencyService.toBase(totals.discountAmount, currencySnapshot),
            tax,
            baseTax: this.currencyService.toBase(tax, currencySnapshot),
            status: dto.status || 'completed',
            paymentStatus: paymentSummary.paymentStatus,
            type: 'sale',
            date: new Date(),
            paymentDueDate: dto.paymentDueDate ? new Date(dto.paymentDueDate) : null,
            customerId: dto.customerId ? new Types.ObjectId(dto.customerId) : null,
            cashierId: new Types.ObjectId(userId),
            terminalId: 'backoffice',
            items: dto.items.map((i) => ({
              ...costByLine.get(`${i.productId}:${i.variantId || ''}`),
              baseUnitCost: this.currencyService.toBase(
                costByLine.get(`${i.productId}:${i.variantId || ''}`)?.unitCost || 0,
                currencySnapshot,
              ),
              baseLineCost: this.currencyService.toBase(
                costByLine.get(`${i.productId}:${i.variantId || ''}`)?.lineCost || 0,
                currencySnapshot,
              ),
              productId: new Types.ObjectId(i.productId),
              variantId: i.variantId || null,
              productName: i.productName,
              quantity: normalizeQuantity(i.quantity),
              price: roundMoney(i.price),
              discount: roundMoney(i.discount || 0),
            })),
            payments: (dto.payments || []).map((p) => ({
              method: p.method,
              amount: roundMoney(p.amount),
              baseAmount: this.currencyService.toBase(roundMoney(p.amount), currencySnapshot),
              transactionId: p.transactionId || null,
              date: new Date(),
            })),
            notes: dto.notes || '',
            storeId: sid,
            tenantId: tid,
          },
        ],
        { session },
      );

      for (const item of dto.items) {
        await this.stockLedger.deductForSale(
          tenantId,
          storeId,
          item.productId,
          item.variantId || null,
          item.quantity,
          sale._id.toString(),
          userId,
          session,
        );
      }
      await this.postSaleJournal(tenantId, storeId, userId, sale, session);

      await session.commitTransaction();

      this.webhookDispatch.emit(tenantId, 'sale.created', {
        saleId: sale._id.toString(),
        orderNumber: sale.orderNumber,
        totalAmount: sale.totalAmount,
        storeId,
      });

      return this.mapSale(sale.toObject());
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      void session.endSession();
    }
  }

  // ── Record payment on existing sale ──

  async recordPayment(tenantId: string, storeId: string, saleId: string, dto: RecordPaymentDto) {
    const sale = await this.saleModel.findOne({
      _id: new Types.ObjectId(saleId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      type: 'sale',
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.paymentStatus === 'paid') {
      throw new BadRequestException('This sale is already fully paid');
    }

    sale.payments.push({
      method: dto.method,
      amount: roundMoney(dto.amount),
      transactionId: dto.transactionId || null,
      date: new Date(),
    } as any);

    const paymentSummary = calculatePaymentSummary(sale.totalAmount, sale.payments);
    sale.paymentStatus = paymentSummary.paymentStatus;

    await sale.save();
    return this.mapSale(sale.toObject());
  }

  // ── Process return (atomic stock reversal) ──

  async processReturn(
    tenantId: string,
    storeId: string,
    userId: string,
    saleId: string,
    dto: ProcessReturnDto,
    actor?: { userName?: string; ip?: string },
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const tid = new Types.ObjectId(tenantId);
      const sid = new Types.ObjectId(storeId);

      const originalSale = await this.saleModel
        .findOne({
          _id: new Types.ObjectId(saleId),
          tenantId: tid,
          storeId: sid,
          type: 'sale',
        })
        .session(session);

      if (!originalSale) throw new NotFoundException('Original sale not found');

      const priorReturns = await this.saleModel
        .find({ tenantId: tid, storeId: sid, type: 'return', returnRef: originalSale._id })
        .session(session)
        .lean();
      const returnedQtyByLine = new Map<string, number>();
      for (const row of priorReturns) {
        for (const item of row.items || []) {
          const key = `${item.productId.toString()}:${item.variantId || ''}`;
          returnedQtyByLine.set(
            key,
            (returnedQtyByLine.get(key) || 0) + Number(item.quantity || 0),
          );
        }
      }

      const originalSubtotal = Math.max(0, Number(originalSale.subtotal || 0));
      const originalDiscount = Math.max(0, Number(originalSale.discount || 0));
      const originalTax = Math.max(0, Number(originalSale.tax || 0));
      let returnBase = 0;
      const normalizedReturnItems: Array<
        ReturnItemDto & {
          quantity: number;
          price: number;
          unitCost: number;
          lineCost: number;
          costSource: string;
        }
      > = [];

      for (const returnItem of dto.items) {
        const origItem = originalSale.items.find(
          (i) =>
            i.productId.toString() === returnItem.productId &&
            String(i.variantId || '') === String(returnItem.variantId || ''),
        );
        if (!origItem) {
          throw new BadRequestException(`Product "${returnItem.productName}" not in original sale`);
        }
        const key = `${returnItem.productId}:${returnItem.variantId || ''}`;
        const alreadyReturned = returnedQtyByLine.get(key) || 0;
        const quantity = normalizeQuantity(returnItem.quantity);
        const availableToReturn = Math.max(0, Number(origItem.quantity || 0) - alreadyReturned);
        if (quantity > availableToReturn) {
          throw new BadRequestException(
            `Return qty (${quantity}) exceeds remaining sold qty (${availableToReturn}) for "${returnItem.productName}"`,
          );
        }

        const lineNet = roundMoney(
          Number(origItem.quantity || 0) * Number(origItem.price || 0) -
            Number(origItem.discount || 0),
        );
        const unitNet = roundMoney(lineNet / Number(origItem.quantity || 1));
        const lineRefund = roundMoney(unitNet * quantity);
        const unitCost = roundMoney(Number((origItem as any).unitCost || 0));
        returnBase = roundMoney(returnBase + lineRefund);
        normalizedReturnItems.push({
          ...returnItem,
          quantity,
          price: unitNet,
          unitCost,
          lineCost: roundMoney(unitCost * quantity),
          costSource: (origItem as any).costSource || 'return',
        });
      }

      const discountShare =
        originalSubtotal > 0
          ? roundMoney(
              Math.min(originalDiscount, (originalDiscount * returnBase) / originalSubtotal),
            )
          : 0;
      const taxableOriginal = Math.max(0, originalSubtotal - originalDiscount);
      const taxableReturn = Math.max(0, returnBase - discountShare);
      const taxShare =
        taxableOriginal > 0 ? roundMoney((originalTax * taxableReturn) / taxableOriginal) : 0;
      const refundTotal = roundMoney(taxableReturn + taxShare);

      const orderNumber = await this.nextOrderNumber(tid, sid, session);
      const invoiceNumber = await this.nextInvoiceNumber(tid, sid, session);
      const returnCurrencySnapshot = {
        currency:
          (originalSale as any).currency ||
          (await this.currencyService.resolveStoreCurrency(tenantId, storeId)),
        baseCurrency:
          (originalSale as any).baseCurrency ||
          (await this.currencyService.resolveTenantBaseCurrency(tenantId)),
        exchangeRate: Number((originalSale as any).exchangeRate || 1),
        exchangeRateDate: (originalSale as any).exchangeRateDate || originalSale.date || new Date(),
      };

      const [returnOrder] = await this.saleModel.create(
        [
          {
            orderNumber,
            invoiceNumber,
            totalAmount: -refundTotal,
            currency: returnCurrencySnapshot.currency,
            baseCurrency: returnCurrencySnapshot.baseCurrency,
            exchangeRate: returnCurrencySnapshot.exchangeRate,
            exchangeRateDate: returnCurrencySnapshot.exchangeRateDate,
            baseTotalAmount: -this.currencyService.toBase(refundTotal, returnCurrencySnapshot),
            subtotal: -returnBase,
            baseSubtotal: -this.currencyService.toBase(returnBase, returnCurrencySnapshot),
            discount: -discountShare,
            baseDiscount: -this.currencyService.toBase(discountShare, returnCurrencySnapshot),
            tax: -taxShare,
            baseTax: -this.currencyService.toBase(taxShare, returnCurrencySnapshot),
            status: 'refunded',
            paymentStatus: 'paid',
            type: 'return',
            date: new Date(),
            customerId: originalSale.customerId || null,
            cashierId: new Types.ObjectId(userId),
            terminalId: 'backoffice',
            items: normalizedReturnItems.map((i) => ({
              productId: new Types.ObjectId(i.productId),
              variantId: i.variantId || null,
              productName: i.productName,
              quantity: i.quantity,
              price: i.price,
              discount: 0,
              unitCost: i.unitCost,
              lineCost: i.lineCost,
              baseUnitCost: this.currencyService.toBase(i.unitCost, returnCurrencySnapshot),
              baseLineCost: this.currencyService.toBase(i.lineCost, returnCurrencySnapshot),
              costSource: i.costSource,
            })),
            payments: [],
            returnRef: originalSale._id,
            returnReason: dto.reason,
            notes: dto.notes || '',
            storeId: sid,
            tenantId: tid,
          },
        ],
        { session },
      );

      for (const returnItem of normalizedReturnItems) {
        await this.stockLedger.restoreForReturn(
          tenantId,
          storeId,
          returnItem.productId,
          returnItem.variantId || null,
          returnItem.quantity,
          returnOrder._id.toString(),
          userId,
          session,
        );
      }

      const allLinesFullyReturned = originalSale.items.every((item) => {
        const key = `${item.productId.toString()}:${item.variantId || ''}`;
        const prior = returnedQtyByLine.get(key) || 0;
        const added = normalizedReturnItems
          .filter(
            (ret) =>
              ret.productId === item.productId.toString() &&
              String(ret.variantId || '') === String(item.variantId || ''),
          )
          .reduce((sum, ret) => sum + ret.quantity, 0);
        return prior + added >= Number(item.quantity || 0);
      });
      originalSale.status = allLinesFullyReturned ? 'refunded' : 'completed';
      await originalSale.save({ session });
      await this.postSaleJournal(tenantId, storeId, userId, returnOrder, session);

      await session.commitTransaction();

      await this.auditService.log({
        tenantId,
        storeId,
        userId,
        userName: actor?.userName || userId,
        action: 'sale.refund',
        entity: 'sale',
        entityId: saleId,
        summary: `Refund processed for sale ${originalSale.orderNumber}`,
        ip: actor?.ip,
      });

      return this.mapSale(returnOrder.toObject());
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      void session.endSession();
    }
  }

  // ── Invoice HTML ──

  async getInvoiceHtml(tenantId: string, storeId: string, saleId: string) {
    const sale = await this.saleModel
      .findOne({
        _id: new Types.ObjectId(saleId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .populate('customerId', 'name email phone address')
      .populate('cashierId', 'fullName')
      .lean();

    if (!sale) throw new NotFoundException('Sale not found');

    const store = await this.storeModel.findById(storeId).lean();
    const storeName = store?.name || 'Store';
    const storeAddress = store?.address || '';
    const customer = sale.customerId as any;
    const cashier = sale.cashierId as any;

    const itemRows = sale.items
      .map(
        (i, idx) =>
          `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
            <td style="padding:8px;border-bottom:1px solid #eee">${i.productName}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${i.price.toFixed(2)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${(i.discount || 0).toFixed(2)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${(i.quantity * i.price - (i.discount || 0)).toFixed(2)}</td>
          </tr>`,
      )
      .join('');

    const paymentRows = sale.payments
      .map(
        (p) =>
          `<tr>
            <td style="padding:4px 8px">${p.method.toUpperCase()}</td>
            <td style="padding:4px 8px;text-align:right">${p.amount.toFixed(2)}</td>
            <td style="padding:4px 8px">${p.transactionId || '—'}</td>
            <td style="padding:4px 8px">${p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
          </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${sale.invoiceNumber || sale.orderNumber}</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;margin:0;padding:40px;color:#1a1a2e;font-size:14px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
    .company h1{margin:0;font-size:24px;color:#e8630a}
    .company p{margin:4px 0;color:#666}
    .invoice-meta{text-align:right}
    .invoice-meta h2{margin:0;font-size:20px;color:#333}
    .invoice-meta p{margin:4px 0;color:#666;font-size:13px}
    .parties{display:flex;gap:40px;margin-bottom:24px}
    .parties .box{flex:1;background:#f8f9fa;border-radius:8px;padding:16px}
    .parties .box h4{margin:0 0 8px;color:#333;font-size:13px;text-transform:uppercase;letter-spacing:0.5px}
    .parties .box p{margin:2px 0;color:#555}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    thead th{background:#f1f3f5;padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.3px;color:#555}
    .totals{margin-left:auto;width:280px}
    .totals table{margin:0}
    .totals td{padding:6px 8px;font-size:13px}
    .totals .grand{font-size:16px;font-weight:700;border-top:2px solid #333}
    .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
    .badge-paid{background:#d3f9d8;color:#2b8a3e}
    .badge-partial{background:#fff3bf;color:#e67700}
    .badge-unpaid{background:#ffe3e3;color:#c92a2a}
    .footer{margin-top:40px;text-align:center;color:#999;font-size:12px;border-top:1px solid #eee;padding-top:16px}
    @media print{body{padding:20px}@page{margin:15mm}}
  </style>
</head>
<body>
  <div class="header">
    <div class="company">
      <h1>${storeName}</h1>
      <p>${storeAddress}</p>
    </div>
    <div class="invoice-meta">
      <h2>INVOICE</h2>
      <p><strong>${sale.invoiceNumber || sale.orderNumber}</strong></p>
      <p>Date: ${new Date(sale.date).toLocaleDateString()}</p>
      <p>Order: ${sale.orderNumber}</p>
      <p>Status: <span class="badge badge-${sale.paymentStatus}">${sale.paymentStatus.toUpperCase()}</span></p>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <h4>Bill To</h4>
      ${customer ? `<p><strong>${customer.name}</strong></p><p>${customer.email || ''}</p><p>${customer.phone || ''}</p><p>${customer.address || ''}</p>` : '<p>Walk-in Customer</p>'}
    </div>
    <div class="box">
      <h4>Sold By</h4>
      <p>${cashier?.fullName || '—'}</p>
      <p>Terminal: ${sale.terminalId}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Product</th><th style="text-align:center">Qty</th>
        <th style="text-align:right">Price</th><th style="text-align:right">Discount</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td style="text-align:right">${sale.subtotal.toFixed(2)}</td></tr>
      ${sale.discount ? `<tr><td>Discount</td><td style="text-align:right">-${sale.discount.toFixed(2)}</td></tr>` : ''}
      ${sale.tax ? `<tr><td>Tax</td><td style="text-align:right">${sale.tax.toFixed(2)}</td></tr>` : ''}
      <tr class="grand"><td>Total</td><td style="text-align:right">${Math.abs(sale.totalAmount).toFixed(2)}</td></tr>
    </table>
  </div>

  ${
    sale.payments.length > 0
      ? `
  <h4 style="margin-bottom:8px">Payments</h4>
  <table>
    <thead><tr><th>Method</th><th style="text-align:right">Amount</th><th>Ref</th><th>Date</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>`
      : ''
  }

  ${sale.notes ? `<p style="margin-top:16px;color:#555"><strong>Notes:</strong> ${sale.notes}</p>` : ''}

  <div class="footer">
    <p>Thank you for your business!</p>
  </div>
</body>
</html>`;
  }

  // ── Export CSV ──

  async exportCsv(tenantId: string, storeId: string, query: any): Promise<string> {
    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.dateFrom || query.dateTo) {
      filter.date = {};
      if (query.dateFrom) filter.date.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.date.$lte = new Date(query.dateTo + 'T23:59:59.999Z');
    }

    const sales = await this.saleModel
      .find(filter)
      .sort({ date: -1 })
      .populate('customerId', 'name')
      .lean();

    const header =
      'Order #,Invoice #,Date,Type,Status,Payment Status,Customer,Items,Subtotal,Discount,Tax,Total';
    const rows = sales.map((s) => {
      const customer = (s.customerId as any)?.name || 'Walk-in';
      const itemCount = s.items.length;
      const date = new Date(s.date).toISOString().split('T')[0];
      return [
        s.orderNumber,
        s.invoiceNumber || '',
        date,
        s.type,
        s.status,
        s.paymentStatus,
        `"${customer}"`,
        itemCount,
        s.subtotal.toFixed(2),
        s.discount.toFixed(2),
        s.tax.toFixed(2),
        s.totalAmount.toFixed(2),
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  // ── Returns list ──

  async findReturns(tenantId: string, storeId: string, query: any) {
    return this.findAll(tenantId, storeId, { ...query, type: 'return' });
  }

  // ── Helpers ──

  private async nextOrderNumber(
    tenantId: Types.ObjectId,
    storeId: Types.ObjectId,
    session?: any,
  ): Promise<string> {
    return allocateOrderNumber(
      this.saleModel,
      this.counterModel,
      tenantId,
      storeId,
      session ?? null,
    );
  }

  private async nextInvoiceNumber(
    tenantId: Types.ObjectId,
    storeId: Types.ObjectId,
    session?: any,
  ): Promise<string> {
    const counter = await this.counterModel.findOneAndUpdate(
      { tenantId, storeId },
      { $inc: { lastNumber: 1 } },
      { upsert: true, new: true, session },
    );
    const prefix = counter.prefix || 'INV';
    return `${prefix}-${String(counter.lastNumber).padStart(6, '0')}`;
  }

  private mapSale(s: any) {
    const customerObj =
      s.customerId && typeof s.customerId === 'object'
        ? {
            _id: s.customerId._id?.toString(),
            name: s.customerId.name,
            email: s.customerId.email,
            phone: s.customerId.phone,
            address: s.customerId.address,
          }
        : null;

    const cashierObj =
      s.cashierId && typeof s.cashierId === 'object'
        ? {
            _id: s.cashierId._id?.toString(),
            fullName: s.cashierId.fullName,
            email: s.cashierId.email,
          }
        : null;

    const subtotal = Number(s.subtotal ?? 0);
    const discount = Number(s.discount ?? 0);
    const tax = Number(s.tax ?? 0);
    const totalAmount = Number(s.totalAmount ?? 0);

    return {
      _id: s._id?.toString() || s._id,
      orderNumber: s.orderNumber,
      invoiceNumber: s.invoiceNumber,
      date: s.date,
      type: s.type,
      status: s.status,
      paymentStatus: s.paymentStatus,
      paymentDueDate: s.paymentDueDate,
      subtotal,
      discount,
      tax,
      totalAmount,
      total: totalAmount,
      refundAmount: s.type === 'return' ? Math.abs(totalAmount) : undefined,
      totals: {
        subtotal,
        discount,
        tax,
        grandTotal: totalAmount,
      },
      items: s.items,
      payments: s.payments,
      customer: customerObj ? customerObj : s.customerId ? { _id: s.customerId.toString() } : null,
      customerName: customerObj?.name,
      customerEmail: customerObj?.email,
      cashier: cashierObj ? cashierObj : s.cashierId ? { _id: s.cashierId.toString() } : null,
      cashierName: cashierObj?.fullName,
      returnRef: s.returnRef
        ? typeof s.returnRef === 'object'
          ? {
              _id: s.returnRef._id?.toString(),
              orderNumber: s.returnRef.orderNumber,
              invoiceNumber: s.returnRef.invoiceNumber,
            }
          : s.returnRef.toString()
        : null,
      originalOrderNumber:
        s.returnRef && typeof s.returnRef === 'object' ? s.returnRef.orderNumber : undefined,
      saleId:
        s.returnRef && typeof s.returnRef === 'object' ? s.returnRef._id?.toString() : undefined,
      returnReason: s.returnReason || '',
      notes: s.notes || '',
      terminalId: s.terminalId,
      createdAt: s.createdAt,
    };
  }
}
