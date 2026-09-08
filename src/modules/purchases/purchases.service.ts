import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { PurchaseOrder, PurchaseOrderDocument } from '../../database/schemas/purchase-order.schema';
import {
  GoodsReceivedNote,
  GoodsReceivedNoteDocument,
} from '../../database/schemas/goods-received-note.schema';
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from '../../database/schemas/supplier-invoice.schema';
import {
  PurchaseReturn,
  PurchaseReturnDocument,
} from '../../database/schemas/purchase-return.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Stock, StockDocument } from '../../database/schemas/stock.schema';
import { Warehouse, WarehouseDocument } from '../../database/schemas/warehouse.schema';
import {
  InvoiceCounter,
  InvoiceCounterDocument,
} from '../../database/schemas/invoice-counter.schema';
import { Supplier, SupplierDocument } from '../../database/schemas/supplier.schema';
import { StockLedgerService } from '../../common/services/stock-ledger.service';
import {
  calculatePurchaseTotals,
  normalizeQuantity,
  roundMoney,
} from '../../common/utils/money.util';
import { FinanceService } from '../finance/finance.service';
import {
  RecordSupplierInvoiceDto,
  RecordSupplierPaymentDto,
} from './dto/record-supplier-invoice.dto';
import { CurrencyService } from '../../common/services/currency.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'approved', 'cancelled'],
  pending_approval: ['approved', 'cancelled'],
  approved: ['ordered', 'cancelled'],
  ordered: ['partially_received', 'completed', 'cancelled'],
  partially_received: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

@Injectable()
export class PurchasesService {
  constructor(
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(GoodsReceivedNote.name) private grnModel: Model<GoodsReceivedNoteDocument>,
    @InjectModel(SupplierInvoice.name) private invoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(PurchaseReturn.name) private returnModel: Model<PurchaseReturnDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Stock.name) private stockModel: Model<StockDocument>,
    @InjectModel(Warehouse.name) private warehouseModel: Model<WarehouseDocument>,
    @InjectModel(InvoiceCounter.name) private counterModel: Model<InvoiceCounterDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectConnection() private connection: Connection,
    private stockLedger: StockLedgerService,
    private financeService: FinanceService,
    private currencyService: CurrencyService,
  ) {}

  // ── PO List ──

  async findAll(tenantId: string, storeId: string, query: any) {
    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };

    if (query.status) filter.status = query.status;
    if (query.supplierId) filter.supplierId = new Types.ObjectId(query.supplierId);
    if (query.search) {
      filter.$or = [{ poNumber: { $regex: query.search, $options: 'i' } }];
    }
    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo + 'T23:59:59.999Z');
    }

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);

    const [data, total] = await Promise.all([
      this.poModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('supplierId', 'name email phone')
        .lean(),
      this.poModel.countDocuments(filter),
    ]);

    return {
      data: data.map((po) => this.mapPO(po)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findSupplierInvoices(tenantId: string, storeId: string, query: any) {
    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };
    if (query.supplierId) filter.supplierId = new Types.ObjectId(query.supplierId);
    if (query.status) filter.status = query.status;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.search) {
      filter.invoiceNumber = { $regex: query.search, $options: 'i' };
    }
    if (query.dateFrom || query.dateTo) {
      filter.invoiceDate = {};
      if (query.dateFrom) filter.invoiceDate.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.invoiceDate.$lte = new Date(`${query.dateTo}T23:59:59.999Z`);
    }

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);
    const [data, total] = await Promise.all([
      this.invoiceModel
        .find(filter)
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('poId', 'poNumber totalAmount status')
        .populate('supplierId', 'name email phone')
        .lean(),
      this.invoiceModel.countDocuments(filter),
    ]);

    return {
      data: data.map((invoice: any) => ({
        _id: invoice._id?.toString(),
        invoiceNumber: invoice.invoiceNumber,
        poId: invoice.poId,
        supplierId: invoice.supplierId,
        amount: invoice.totalAmount ?? invoice.amount ?? 0,
        totalAmount: invoice.totalAmount ?? invoice.amount ?? 0,
        paidAmount: invoice.paidAmount || 0,
        balanceDue:
          invoice.balanceDue ??
          Math.max(0, (invoice.totalAmount ?? invoice.amount ?? 0) - (invoice.paidAmount || 0)),
        status: invoice.status || 'pending',
        paymentStatus: invoice.paymentStatus || 'unpaid',
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        verifiedAt: invoice.verifiedAt,
        paidAt: invoice.paidAt,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // ── PO Detail ──

  async findOne(tenantId: string, storeId: string, id: string) {
    const po = await this.poModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .populate('supplierId', 'name email phone address')
      .populate('approvedBy', 'fullName')
      .populate('warehouseId', 'name code')
      .lean();
    if (!po) throw new NotFoundException('Purchase order not found');
    return this.mapPO(po);
  }

  // ── Create PO ──

  async create(tenantId: string, storeId: string, userId: string, dto: any) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);

    const totals = calculatePurchaseTotals(dto);
    const poNumber = await this.nextSequence(tid, sid, 'lastPurchaseOrderNumber', 'PO');
    const currencySnapshot = await this.currencyService.resolveSnapshot(
      tenantId,
      storeId,
      new Date(),
    );

    const po = await this.poModel.create({
      poNumber,
      supplierId: new Types.ObjectId(dto.supplierId),
      storeId: sid,
      warehouseId: dto.warehouseId ? new Types.ObjectId(dto.warehouseId) : null,
      items: dto.items.map((i: any) => ({
        productId: new Types.ObjectId(i.productId),
        variantId: i.variantId || null,
        productName: i.productName,
        quantity: normalizeQuantity(i.quantity),
        unitCost: roundMoney(i.unitCost),
        baseUnitCost: this.currencyService.toBase(roundMoney(i.unitCost), currencySnapshot),
        taxPercent: Number(i.taxPercent || 0),
        received: 0,
      })),
      subtotal: totals.subtotal,
      baseSubtotal: this.currencyService.toBase(totals.subtotal, currencySnapshot),
      taxTotal: totals.taxTotal,
      baseTaxTotal: this.currencyService.toBase(totals.taxTotal, currencySnapshot),
      discount: totals.discount,
      baseDiscount: this.currencyService.toBase(totals.discount, currencySnapshot),
      shipping: totals.shipping,
      baseShipping: this.currencyService.toBase(totals.shipping, currencySnapshot),
      totalAmount: totals.totalAmount,
      currency: currencySnapshot.currency,
      baseCurrency: currencySnapshot.baseCurrency,
      exchangeRate: currencySnapshot.exchangeRate,
      exchangeRateDate: currencySnapshot.exchangeRateDate,
      baseTotalAmount: this.currencyService.toBase(totals.totalAmount, currencySnapshot),
      status: dto.status || 'draft',
      expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
      notes: dto.notes || '',
      tenantId: tid,
    });

    return this.mapPO(po.toObject());
  }

  // ── Update PO ──

  async update(tenantId: string, storeId: string, id: string, dto: any) {
    const po = await this.poModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!['draft', 'pending_approval'].includes(po.status)) {
      throw new BadRequestException('Only draft or pending approval POs can be edited');
    }

    const totals = calculatePurchaseTotals(dto);
    const currencySnapshot = await this.currencyService.resolveSnapshot(
      tenantId,
      storeId,
      new Date(),
    );

    po.supplierId = new Types.ObjectId(dto.supplierId) as any;
    po.warehouseId = (dto.warehouseId ? new Types.ObjectId(dto.warehouseId) : null) as any;
    po.items = dto.items.map((i: any) => ({
      productId: new Types.ObjectId(i.productId),
      variantId: i.variantId || null,
      productName: i.productName,
      quantity: normalizeQuantity(i.quantity),
      unitCost: roundMoney(i.unitCost),
      baseUnitCost: this.currencyService.toBase(roundMoney(i.unitCost), currencySnapshot),
      taxPercent: Number(i.taxPercent || 0),
      received: 0,
    })) as any;
    po.subtotal = totals.subtotal;
    (po as any).baseSubtotal = this.currencyService.toBase(totals.subtotal, currencySnapshot);
    po.taxTotal = totals.taxTotal;
    (po as any).baseTaxTotal = this.currencyService.toBase(totals.taxTotal, currencySnapshot);
    po.discount = totals.discount;
    (po as any).baseDiscount = this.currencyService.toBase(totals.discount, currencySnapshot);
    po.shipping = totals.shipping;
    (po as any).baseShipping = this.currencyService.toBase(totals.shipping, currencySnapshot);
    po.totalAmount = totals.totalAmount;
    (po as any).currency = currencySnapshot.currency;
    (po as any).baseCurrency = currencySnapshot.baseCurrency;
    (po as any).exchangeRate = currencySnapshot.exchangeRate;
    (po as any).exchangeRateDate = currencySnapshot.exchangeRateDate;
    (po as any).baseTotalAmount = this.currencyService.toBase(totals.totalAmount, currencySnapshot);
    po.expectedDate = (dto.expectedDate ? new Date(dto.expectedDate) : null) as any;
    po.notes = dto.notes || '';
    po.status = dto.status || po.status;

    await po.save();
    return this.mapPO(po.toObject());
  }

  // ── Update PO Status ──

  async updateStatus(
    tenantId: string,
    storeId: string,
    userId: string,
    id: string,
    newStatus: string,
  ) {
    const po = await this.poModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    const allowed = VALID_TRANSITIONS[po.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from "${po.status}" to "${newStatus}"`);
    }

    po.status = newStatus;
    if (newStatus === 'approved') {
      po.approvedBy = new Types.ObjectId(userId) as any;
      po.approvedAt = new Date();
    }
    await po.save();
    return this.mapPO(po.toObject());
  }

  // ── Receive Goods (GRN) ──

  async receiveGoods(tenantId: string, storeId: string, userId: string, poId: string, dto: any) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const tid = new Types.ObjectId(tenantId);
      const sid = new Types.ObjectId(storeId);

      const po = await this.poModel
        .findOne({
          _id: new Types.ObjectId(poId),
          tenantId: tid,
          storeId: sid,
        })
        .session(session);

      if (!po) throw new NotFoundException('Purchase order not found');
      if (!['approved', 'ordered', 'partially_received'].includes(po.status)) {
        throw new BadRequestException('PO must be approved/ordered to receive goods');
      }
      const receiveWarehouseId = po.warehouseId?.toString?.() || null;

      for (const item of dto.items) {
        const poItem = po.items.find(
          (i) =>
            i.productId.toString() === item.productId &&
            String(i.variantId || '') === String(item.variantId || ''),
        );
        if (!poItem) throw new BadRequestException(`Product ${item.productId} not in this PO`);

        const quantity = normalizeQuantity(item.quantity);
        const remaining = Math.max(0, Number(poItem.quantity || 0) - Number(poItem.received || 0));
        if (quantity > remaining) {
          throw new BadRequestException(
            `Cannot receive ${quantity} of "${poItem.productName}" (${remaining} remaining)`,
          );
        }

        poItem.received = roundMoney(Number(poItem.received || 0) + quantity, 3);

        await this.stockLedger.applyDelta({
          tenantId,
          storeId,
          productId: item.productId,
          variantId: item.variantId || null,
          quantity,
          type: 'in',
          reason: 'purchase_receive',
          referenceId: po._id.toString(),
          userId,
          warehouseId: receiveWarehouseId,
          session,
        });
      }

      const allReceived = po.items.every((i) => i.received >= i.quantity);
      po.status = dto.isPartial || !allReceived ? 'partially_received' : 'completed';
      po.markModified('items');
      await po.save({ session });

      const grnNumber = await this.nextSequence(
        tid,
        sid,
        'lastGoodsReceivedNumber',
        'GRN',
        session,
      );
      const grn = await this.grnModel.create(
        [
          {
            grnNumber,
            poId: po._id,
            warehouseId: receiveWarehouseId ? new Types.ObjectId(receiveWarehouseId) : null,
            items: dto.items.map((i: any) => ({
              productId: new Types.ObjectId(i.productId),
              variantId: i.variantId || null,
              productName:
                po.items.find(
                  (p) =>
                    p.productId.toString() === i.productId &&
                    String(p.variantId || '') === String(i.variantId || ''),
                )?.productName || '',
              quantity: normalizeQuantity(i.quantity),
            })),
            isPartial: dto.isPartial || !allReceived,
            receivedBy: new Types.ObjectId(userId),
            date: new Date(),
            notes: dto.notes || '',
            storeId: sid,
            tenantId: tid,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      return { grn: grn[0], poStatus: po.status };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      void session.endSession();
    }
  }

  // ── Get GRNs for a PO ──

  async getGRNs(tenantId: string, storeId: string, poId: string) {
    return this.grnModel
      .find({
        poId: new Types.ObjectId(poId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .sort({ date: -1 })
      .populate('receivedBy', 'fullName')
      .lean();
  }

  // ── Supplier Invoice ──

  async recordInvoice(
    tenantId: string,
    storeId: string,
    userId: string,
    poId: string,
    dto: RecordSupplierInvoiceDto,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);

    const po = await this.poModel.findOne({
      _id: new Types.ObjectId(poId),
      tenantId: tid,
      storeId: sid,
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    const duplicate = await this.invoiceModel.findOne({
      tenantId: tid,
      storeId: sid,
      invoiceNumber: dto.invoiceNumber,
    });
    if (duplicate)
      throw new BadRequestException('Supplier invoice number already exists for this store');

    const amount = roundMoney(dto.amount);
    if (amount <= 0) throw new BadRequestException('Invoice amount must be greater than zero');
    if (amount > roundMoney(po.totalAmount)) {
      throw new BadRequestException(
        `Invoice amount (${amount}) cannot exceed PO total (${roundMoney(po.totalAmount)})`,
      );
    }
    const invoiceCurrencySnapshot = {
      currency:
        (po as any).currency ||
        (await this.currencyService.resolveStoreCurrency(tenantId, storeId)),
      baseCurrency:
        (po as any).baseCurrency ||
        (await this.currencyService.resolveTenantBaseCurrency(tenantId)),
      exchangeRate: Number((po as any).exchangeRate || 1),
      exchangeRateDate: (po as any).exchangeRateDate || new Date(dto.invoiceDate),
    };
    const baseAmount = this.currencyService.toBase(amount, invoiceCurrencySnapshot);

    const invoice = await this.invoiceModel.create({
      invoiceNumber: dto.invoiceNumber,
      poId: po._id,
      supplierId: po.supplierId,
      amount,
      baseAmount,
      totalAmount: amount,
      currency: invoiceCurrencySnapshot.currency,
      baseCurrency: invoiceCurrencySnapshot.baseCurrency,
      exchangeRate: invoiceCurrencySnapshot.exchangeRate,
      exchangeRateDate: invoiceCurrencySnapshot.exchangeRateDate,
      baseTotalAmount: baseAmount,
      paidAmount: 0,
      basePaidAmount: 0,
      balanceDue: amount,
      baseBalanceDue: baseAmount,
      paymentStatus: 'unpaid',
      invoiceDate: new Date(dto.invoiceDate),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      notes: dto.notes || '',
      storeId: sid,
      tenantId: tid,
    });
    await this.supplierModel.updateOne(
      { _id: po.supplierId, tenantId: tid, storeId: sid },
      { $inc: { payableBalance: amount, basePayableBalance: baseAmount } },
    );

    return invoice;
  }

  async verifyInvoice(tenantId: string, storeId: string, userId: string, invoiceId: string) {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(invoiceId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    invoice.status = invoice.paymentStatus === 'paid' ? 'paid' : 'verified';
    invoice.verifiedAt = invoice.verifiedAt || new Date();
    await invoice.save();

    await this.financeService.postOperationalJournal({
      tenantId,
      storeId,
      userId,
      sourceType: 'supplier_invoice',
      sourceId: invoice._id.toString(),
      description: `Supplier invoice ${invoice.invoiceNumber}`,
      date: invoice.invoiceDate,
      lines: [
        {
          accountCode: '5100',
          debit: (invoice as any).baseTotalAmount || invoice.totalAmount,
          description: 'Purchase / inventory clearing',
        },
        {
          accountCode: '2000',
          credit: (invoice as any).baseTotalAmount || invoice.totalAmount,
          description: 'Accounts payable',
        },
      ],
      sourceCurrency: (invoice as any).currency,
      baseCurrency: (invoice as any).baseCurrency,
      exchangeRate: (invoice as any).exchangeRate,
      exchangeRateDate: (invoice as any).exchangeRateDate,
    });

    return invoice;
  }

  async recordInvoicePayment(
    tenantId: string,
    storeId: string,
    userId: string,
    invoiceId: string,
    dto: RecordSupplierPaymentDto,
  ) {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(invoiceId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');

    const amount = roundMoney(dto.amount);
    if (amount <= 0) throw new BadRequestException('Payment amount must be greater than zero');
    if (amount > roundMoney(invoice.balanceDue || invoice.totalAmount)) {
      throw new BadRequestException(
        `Payment amount (${amount}) exceeds invoice balance (${roundMoney(invoice.balanceDue || 0)})`,
      );
    }
    const baseAmount = this.currencyService.toBase(amount, {
      exchangeRate: Number((invoice as any).exchangeRate || 1),
    });

    invoice.payments.push({
      amount,
      baseAmount,
      method: dto.method || 'cash',
      reference: dto.reference || '',
      paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
    } as any);
    invoice.paidAmount = roundMoney((invoice.paidAmount || 0) + amount);
    (invoice as any).basePaidAmount = roundMoney(
      ((invoice as any).basePaidAmount || 0) + baseAmount,
    );
    invoice.balanceDue = roundMoney(Math.max(0, invoice.totalAmount - invoice.paidAmount));
    (invoice as any).baseBalanceDue = roundMoney(
      Math.max(
        0,
        ((invoice as any).baseTotalAmount || invoice.totalAmount) -
          ((invoice as any).basePaidAmount || 0),
      ),
    );
    invoice.paymentStatus = invoice.balanceDue <= 0 ? 'paid' : 'partial';
    invoice.status = invoice.paymentStatus === 'paid' ? 'paid' : 'verified';
    invoice.paidAt = invoice.paymentStatus === 'paid' ? new Date() : invoice.paidAt;
    if (!invoice.verifiedAt) invoice.verifiedAt = new Date();
    await invoice.save();
    await this.supplierModel.updateOne(
      {
        _id: invoice.supplierId,
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      { $inc: { payableBalance: -amount, basePayableBalance: -baseAmount } },
    );

    await this.financeService.postOperationalJournal({
      tenantId,
      storeId,
      userId,
      sourceType: 'supplier_payment',
      sourceId: `${invoice._id.toString()}-${invoice.payments.length}`,
      description: `Supplier payment ${invoice.invoiceNumber}`,
      date: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      lines: [
        { accountCode: '2000', debit: baseAmount, description: 'Reduce accounts payable' },
        { accountCode: '1000', credit: baseAmount, description: 'Cash / bank payment' },
      ],
      sourceCurrency: (invoice as any).currency,
      baseCurrency: (invoice as any).baseCurrency,
      exchangeRate: (invoice as any).exchangeRate,
      exchangeRateDate: (invoice as any).exchangeRateDate,
    });

    return invoice;
  }

  // ── Purchase Return ──

  async processReturn(tenantId: string, storeId: string, userId: string, poId: string, dto: any) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const tid = new Types.ObjectId(tenantId);
      const sid = new Types.ObjectId(storeId);

      const po = await this.poModel
        .findOne({
          _id: new Types.ObjectId(poId),
          tenantId: tid,
          storeId: sid,
        })
        .session(session);

      if (!po) throw new NotFoundException('Purchase order not found');
      if (!['partially_received', 'completed'].includes(po.status)) {
        throw new BadRequestException('Can only return against received POs');
      }

      const priorReturns = await this.returnModel
        .find({ tenantId: tid, storeId: sid, poId: po._id, status: 'completed' })
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

      const returnCurrencySnapshot = {
        currency:
          (po as any).currency ||
          (await this.currencyService.resolveStoreCurrency(tenantId, storeId)),
        baseCurrency:
          (po as any).baseCurrency ||
          (await this.currencyService.resolveTenantBaseCurrency(tenantId)),
        exchangeRate: Number((po as any).exchangeRate || 1),
        exchangeRateDate: (po as any).exchangeRateDate || new Date(),
      };
      let totalAmount = 0;
      const normalizedItems: Array<{
        productId: string;
        variantId?: string;
        productName: string;
        quantity: number;
        unitCost: number;
      }> = [];
      for (const item of dto.items) {
        const poItem = po.items.find(
          (i) =>
            i.productId.toString() === item.productId &&
            String(i.variantId || '') === String(item.variantId || ''),
        );
        if (!poItem) throw new BadRequestException(`Product not in this PO`);
        const key = `${item.productId}:${item.variantId || ''}`;
        const alreadyReturned = returnedQtyByLine.get(key) || 0;
        const quantity = normalizeQuantity(item.quantity);
        const netReceived = Math.max(0, Number(poItem.received || 0) - alreadyReturned);
        if (quantity > netReceived) {
          throw new BadRequestException(
            `Return qty (${quantity}) exceeds net received qty (${netReceived}) for "${item.productName}"`,
          );
        }

        const unitCost = roundMoney(poItem.unitCost ?? item.unitCost ?? 0);
        totalAmount = roundMoney(totalAmount + quantity * unitCost);
        normalizedItems.push({
          ...item,
          quantity,
          unitCost,
          productName: item.productName || poItem.productName,
        });

        await this.stockLedger.applyDelta({
          tenantId,
          storeId,
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: -quantity,
          type: 'out',
          reason: 'purchase_return',
          referenceId: po._id.toString(),
          userId,
          session,
        });
      }

      const returnNumber = await this.nextSequence(
        tid,
        sid,
        'lastPurchaseReturnNumber',
        'PR',
        session,
      );
      let remainingCredit = totalAmount;
      let appliedAmount = 0;
      const openInvoices = await this.invoiceModel
        .find({
          tenantId: tid,
          storeId: sid,
          supplierId: po.supplierId,
          paymentStatus: { $in: ['unpaid', 'partial'] },
          balanceDue: { $gt: 0 },
        })
        .sort({ invoiceDate: 1, createdAt: 1 })
        .session(session);

      for (const invoice of openInvoices) {
        if (remainingCredit <= 0) break;
        const apply = roundMoney(Math.min(remainingCredit, Number(invoice.balanceDue || 0)));
        const baseApply = this.currencyService.toBase(apply, {
          exchangeRate: Number(
            (invoice as any).exchangeRate || returnCurrencySnapshot.exchangeRate,
          ),
        });
        invoice.balanceDue = roundMoney(Math.max(0, Number(invoice.balanceDue || 0) - apply));
        invoice.paidAmount = roundMoney(
          Math.min(Number(invoice.totalAmount || 0), Number(invoice.paidAmount || 0) + apply),
        );
        (invoice as any).baseBalanceDue = roundMoney(
          Math.max(
            0,
            Number((invoice as any).baseBalanceDue ?? (invoice as any).baseTotalAmount ?? 0) -
              baseApply,
          ),
        );
        (invoice as any).basePaidAmount = roundMoney(
          Math.min(
            Number((invoice as any).baseTotalAmount || invoice.totalAmount || 0),
            Number((invoice as any).basePaidAmount || 0) + baseApply,
          ),
        );
        invoice.paymentStatus = invoice.balanceDue <= 0 ? 'paid' : 'partial';
        invoice.status = invoice.paymentStatus === 'paid' ? 'paid' : 'verified';
        if (invoice.paymentStatus === 'paid') invoice.paidAt = invoice.paidAt || new Date();
        await invoice.save({ session });
        appliedAmount = roundMoney(appliedAmount + apply);
        remainingCredit = roundMoney(remainingCredit - apply);
      }

      const [purchaseReturn] = await this.returnModel.create(
        [
          {
            returnNumber,
            poId: po._id,
            supplierId: po.supplierId,
            items: normalizedItems.map((i: any) => ({
              productId: new Types.ObjectId(i.productId),
              variantId: i.variantId || null,
              productName: i.productName,
              quantity: Number(i.quantity),
              unitCost: Number(i.unitCost),
              baseUnitCost: this.currencyService.toBase(Number(i.unitCost), returnCurrencySnapshot),
            })),
            totalAmount,
            currency: returnCurrencySnapshot.currency,
            baseCurrency: returnCurrencySnapshot.baseCurrency,
            exchangeRate: returnCurrencySnapshot.exchangeRate,
            exchangeRateDate: returnCurrencySnapshot.exchangeRateDate,
            baseTotalAmount: this.currencyService.toBase(totalAmount, returnCurrencySnapshot),
            appliedAmount,
            baseAppliedAmount: this.currencyService.toBase(appliedAmount, returnCurrencySnapshot),
            supplierCreditAmount: remainingCredit,
            baseSupplierCreditAmount: this.currencyService.toBase(
              remainingCredit,
              returnCurrencySnapshot,
            ),
            creditStatus:
              remainingCredit <= 0
                ? 'applied'
                : appliedAmount > 0
                  ? 'partially_applied'
                  : 'unapplied',
            reason: dto.reason,
            status: 'completed',
            createdBy: new Types.ObjectId(userId),
            date: new Date(),
            notes: dto.notes || '',
            storeId: sid,
            tenantId: tid,
          },
        ],
        { session },
      );

      await this.supplierModel.updateOne(
        { _id: po.supplierId, tenantId: tid, storeId: sid },
        {
          $inc: {
            creditBalance: remainingCredit,
            baseCreditBalance: this.currencyService.toBase(remainingCredit, returnCurrencySnapshot),
            payableBalance: -appliedAmount,
            basePayableBalance: -this.currencyService.toBase(appliedAmount, returnCurrencySnapshot),
          },
        },
        { session },
      );

      const baseAppliedAmount = this.currencyService.toBase(appliedAmount, returnCurrencySnapshot);
      const baseSupplierCreditAmount = this.currencyService.toBase(
        remainingCredit,
        returnCurrencySnapshot,
      );
      const returnJournalLines: any[] = [];
      if (baseAppliedAmount > 0) {
        returnJournalLines.push({
          accountCode: '2000',
          debit: baseAppliedAmount,
          description: 'Reduce accounts payable from purchase return',
        });
      }
      if (baseSupplierCreditAmount > 0) {
        returnJournalLines.push({
          accountCode: '1300',
          debit: baseSupplierCreditAmount,
          description: 'Supplier credit from purchase return',
        });
      }
      returnJournalLines.push({
        accountCode: '5100',
        credit: this.currencyService.toBase(totalAmount, returnCurrencySnapshot),
        description: 'Purchase return reversal',
      });
      await this.financeService.postOperationalJournal({
        tenantId,
        storeId,
        userId,
        sourceType: 'purchase_return',
        sourceId: purchaseReturn._id.toString(),
        description: `Purchase return ${purchaseReturn.returnNumber}`,
        date: purchaseReturn.date,
        lines: returnJournalLines,
        session,
        sourceCurrency: returnCurrencySnapshot.currency,
        baseCurrency: returnCurrencySnapshot.baseCurrency,
        exchangeRate: returnCurrencySnapshot.exchangeRate,
        exchangeRateDate: returnCurrencySnapshot.exchangeRateDate,
      });

      await session.commitTransaction();
      return purchaseReturn;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      void session.endSession();
    }
  }

  // ── Purchase Returns List ──

  async findReturns(tenantId: string, storeId: string, query: any) {
    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };
    if (query.search) filter.returnNumber = { $regex: query.search, $options: 'i' };

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 20);

    const [data, total] = await Promise.all([
      this.returnModel
        .find(filter)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('poId', 'poNumber')
        .populate('supplierId', 'name')
        .lean(),
      this.returnModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── Helper ──

  private async nextSequence(
    tenantId: Types.ObjectId,
    storeId: Types.ObjectId,
    field: 'lastPurchaseOrderNumber' | 'lastGoodsReceivedNumber' | 'lastPurchaseReturnNumber',
    prefix: string,
    session?: any,
  ): Promise<string> {
    const counter = await this.counterModel.findOneAndUpdate(
      { tenantId, storeId },
      { $inc: { [field]: 1 } },
      { upsert: true, new: true, session },
    );
    return `${prefix}-${String((counter as any)[field]).padStart(6, '0')}`;
  }

  private mapPO(po: any) {
    return {
      _id: po._id?.toString(),
      poNumber: po.poNumber,
      supplier: po.supplierId
        ? typeof po.supplierId === 'object'
          ? {
              _id: po.supplierId._id?.toString(),
              name: po.supplierId.name,
              email: po.supplierId.email,
              phone: po.supplierId.phone,
              address: po.supplierId.address,
            }
          : { _id: po.supplierId.toString() }
        : null,
      warehouse: po.warehouseId
        ? typeof po.warehouseId === 'object'
          ? {
              _id: po.warehouseId._id?.toString(),
              name: po.warehouseId.name,
              code: po.warehouseId.code,
            }
          : { _id: po.warehouseId.toString() }
        : null,
      warehouseId: po.warehouseId?.toString() || null,
      items: po.items,
      subtotal: po.subtotal,
      taxTotal: po.taxTotal,
      discount: po.discount,
      shipping: po.shipping,
      totalAmount: po.totalAmount,
      status: po.status,
      approvedBy: po.approvedBy
        ? typeof po.approvedBy === 'object'
          ? po.approvedBy.fullName
          : po.approvedBy.toString()
        : null,
      approvedAt: po.approvedAt,
      expectedDate: po.expectedDate,
      notes: po.notes,
      createdAt: po.createdAt,
    };
  }
}
