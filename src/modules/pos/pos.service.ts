import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../../database/schemas/product-variant.schema';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { HeldOrder, HeldOrderDocument } from '../../database/schemas/held-order.schema';
import { PosSettings, PosSettingsDocument } from '../../database/schemas/pos-settings.schema';
import {
  InvoiceCounter,
  InvoiceCounterDocument,
} from '../../database/schemas/invoice-counter.schema';
import {
  allocateOrderNumber,
  dropLegacyOrderNumberIndex,
} from '../../common/utils/sale-order-number.util';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhookDispatchService } from '../../common/services/webhook-dispatch.service';
import { CreateSaleDto, SaleItemDto } from './dto/create-sale.dto';
import { HoldOrderDto } from './dto/hold-order.dto';
import { UpdatePosSettingsDto } from './dto/update-settings.dto';
import {
  calculateCartTotals,
  assertTotalsMatch,
  roundMoney,
  normalizeQuantity,
} from '../../common/utils/money.util';
import { notDeletedFilter } from '../../common/utils/soft-delete.util';
import { escapeRegex } from '../../common/utils/regex.util';
import { StockLedgerService } from '../../common/services/stock-ledger.service';
import { PosPromotionService } from './pos-promotion.service';
import { PosShiftService } from './pos-shift.service';
import { CatalogService } from '../catalog/catalog.service';
import { StoreListing, StoreListingDocument } from '../../database/schemas/store-listing.schema';
import {
  LoyaltyTransaction,
  LoyaltyTransactionDocument,
} from '../../database/schemas/loyalty-transaction.schema';
import { CreateExchangeDto } from './dto/exchange.dto';
import { FinanceService } from '../finance/finance.service';
import { randomBytes } from 'crypto';
import { CurrencyService } from '../../common/services/currency.service';

const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class PosService implements OnModuleInit {
  private readonly logger = new Logger(PosService.name);

  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name) private variantModel: Model<ProductVariantDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(SaleOrder.name) private saleOrderModel: Model<SaleOrderDocument>,
    @InjectModel(HeldOrder.name) private heldOrderModel: Model<HeldOrderDocument>,
    @InjectModel(PosSettings.name) private posSettingsModel: Model<PosSettingsDocument>,
    @InjectModel(InvoiceCounter.name)
    private counterModel: Model<InvoiceCounterDocument>,
    @InjectConnection() private connection: Connection,
    private notificationsService: NotificationsService,
    @InjectModel(StoreListing.name) private listingModel: Model<StoreListingDocument>,
    private stockLedger: StockLedgerService,
    private promotionService: PosPromotionService,
    private catalogService: CatalogService,
    private shiftService: PosShiftService,
    @InjectModel(LoyaltyTransaction.name)
    private loyaltyTxModel: Model<LoyaltyTransactionDocument>,
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

  private resolveRequireShift(settings: any, plan = 'basic'): boolean {
    if (settings?.requireShift != null) return Boolean(settings.requireShift);
    return plan !== 'basic' && plan !== 'trial';
  }

  private async getCentralModeProductFilter(tenantId: string, storeId: string) {
    const mode = await this.catalogService.getCatalogMode(tenantId);
    if (mode !== 'central') return null;

    const listings = await this.listingModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        isActive: true,
      })
      .select('shadowProductId')
      .lean();

    const shadowIds = listings
      .map((l) => l.shadowProductId)
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id!.toString()));

    if (shadowIds.length === 0) {
      return { catalogProductId: null };
    }

    return {
      $or: [{ _id: { $in: shadowIds } }, { catalogProductId: null }],
    };
  }

  async onModuleInit() {
    try {
      await dropLegacyOrderNumberIndex(this.saleOrderModel);
      this.logger.log('Sale order indexes verified');
    } catch (err) {
      this.logger.warn(`Could not drop legacy orderNumber index: ${(err as Error).message}`);
    }
  }

  // ─── Product Search ─────────────────────────────────────────────────

  private mapVariantForPos(v: any, parent: any) {
    const attrs =
      v.attributeValues instanceof Map
        ? Object.fromEntries(v.attributeValues.entries())
        : v.attributeValues || {};
    const label = Object.values(attrs).filter(Boolean).join(' / ') || v.sku;
    return {
      _id: v._id.toString(),
      productId: parent._id.toString(),
      sku: v.sku,
      barcode: v.barcode || v.sku || '',
      label,
      attributeValues: attrs,
      price: v.price ?? parent.price,
      stock: v.stock ?? 0,
      image: v.image || parent.image || '',
    };
  }

  private async loadVariantsForProduct(tenantId: string, storeId: string, productId: string) {
    return this.variantModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        productId: new Types.ObjectId(productId),
        isActive: true,
      })
      .lean();
  }

  private normalizeRetainedPayments(
    payments: { method: string; amount: number; transactionId?: string }[],
    total: number,
  ) {
    let remaining = roundMoney(total);
    const retained: { method: string; amount: number; transactionId?: string }[] = [];

    for (const payment of payments || []) {
      if (remaining <= 0) break;
      const amount = Math.min(roundMoney(payment.amount), remaining);
      if (amount > 0) {
        retained.push({ ...payment, amount });
        remaining = roundMoney(remaining - amount);
      }
    }

    return retained;
  }

  private async mapProductForPos(p: any, tenantId?: string, storeId?: string) {
    const categoryName =
      typeof p.categoryId === 'object' && p.categoryId?.name
        ? p.categoryId.name
        : p.categoryName || '';
    const brandName =
      typeof p.brandId === 'object' && p.brandId?.name ? p.brandId.name : p.brandName || '';
    const unitAbbreviation =
      typeof p.unitId === 'object' && p.unitId?.abbreviation
        ? p.unitId.abbreviation
        : p.unitAbbreviation || '';

    let variants: any[] = [];
    if (p.hasVariants && tenantId && storeId) {
      const variantRows = await this.loadVariantsForProduct(tenantId, storeId, p._id.toString());
      variants = await Promise.all(
        variantRows.map(async (v) => {
          const stock = await this.stockLedger.getAvailableQuantity(
            tenantId,
            storeId,
            p._id.toString(),
            v._id.toString(),
          );
          return { ...this.mapVariantForPos(v, p), stock };
        }),
      );
    }

    const stock =
      tenantId && storeId
        ? await this.stockLedger.getAvailableQuantity(tenantId, storeId, p._id.toString(), null)
        : Number(p.stock ?? 0);

    return {
      _id: p._id.toString(),
      name: p.name,
      sku: p.sku || '',
      barcode: p.barcode || '',
      image: p.image || p.images?.[0] || '',
      price: p.price,
      stock,
      hasVariants: Boolean(p.hasVariants && variants.length > 0),
      categoryName,
      brandName,
      categoryId:
        typeof p.categoryId === 'object'
          ? p.categoryId?._id?.toString?.() || null
          : p.categoryId?.toString?.() || null,
      brandId:
        typeof p.brandId === 'object'
          ? p.brandId?._id?.toString?.() || null
          : p.brandId?.toString?.() || null,
      isWeighted: Boolean(p.isWeighted),
      trackBatches: Boolean(p.trackBatches),
      unitAbbreviation,
      variants,
    };
  }

  async findProductByBarcode(tenantId: string, storeId: string, code: string) {
    const trimmed = (code || '').trim();
    if (!trimmed) throw new BadRequestException('Barcode is required');

    const tenantObjId = new Types.ObjectId(tenantId);
    const storeObjId = new Types.ObjectId(storeId);

    const variant = await this.variantModel
      .findOne({
        tenantId: tenantObjId,
        storeId: storeObjId,
        isActive: true,
        $or: [{ sku: trimmed }],
      })
      .lean();

    if (variant) {
      const product = await this.productModel
        .findOne({
          _id: variant.productId,
          tenantId: tenantObjId,
          storeId: storeObjId,
          isActive: true,
        })
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .lean();
      if (product) {
        const mapped = await this.mapProductForPos(product, tenantId, storeId);
        const matchedVariant = mapped.variants.find((v) => v._id === variant._id.toString()) || {
          ...this.mapVariantForPos(variant, product),
          stock: await this.stockLedger.getAvailableQuantity(
            tenantId,
            storeId,
            product._id.toString(),
            variant._id.toString(),
          ),
        };
        return {
          found: true,
          product: mapped,
          selectedVariant: matchedVariant,
        };
      }
    }

    const product = await this.productModel
      .findOne({
        tenantId: tenantObjId,
        storeId: storeObjId,
        isActive: true,
        $or: [{ barcode: trimmed }, { sku: trimmed }],
      })
      .populate('categoryId', 'name')
      .populate('brandId', 'name')
      .lean();

    if (!product) {
      return { found: false, barcode: trimmed };
    }

    return {
      found: true,
      product: await this.mapProductForPos(product, tenantId, storeId),
    };
  }

  async searchProducts(tenantId: string, storeId: string, query: string) {
    const tenantObjId = new Types.ObjectId(tenantId);
    const storeObjId = new Types.ObjectId(storeId);

    const centralFilter = await this.getCentralModeProductFilter(tenantId, storeId);

    if (!query || query.length < 1) {
      const baseFilter: any = {
        tenantId: tenantObjId,
        storeId: storeObjId,
        isActive: true,
        ...notDeletedFilter(),
      };
      if (centralFilter) Object.assign(baseFilter, centralFilter);

      const products = await this.productModel
        .find(baseFilter)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('unitId', 'name abbreviation')
        .sort({ name: 1 })
        .limit(50)
        .lean();
      return Promise.all(products.map((p) => this.mapProductForPos(p, tenantId, storeId)));
    }

    const trimmed = query.trim();

    const exact = await this.findProductByBarcode(tenantId, storeId, trimmed);
    if (exact.found && exact.product) {
      return [exact.product];
    }

    const regex = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const variantMatches = await this.variantModel
      .find({
        tenantId: tenantObjId,
        storeId: storeObjId,
        isActive: true,
        sku: regex,
      })
      .limit(10)
      .lean();

    const variantProductIds = [...new Set(variantMatches.map((v) => v.productId.toString()))];

    const searchFilter: any = {
      tenantId: tenantObjId,
      storeId: storeObjId,
      isActive: true,
      ...notDeletedFilter(),
      $or: [
        { name: regex },
        { sku: regex },
        { barcode: regex },
        ...(variantProductIds.length
          ? [{ _id: { $in: variantProductIds.map((id) => new Types.ObjectId(id)) } }]
          : []),
      ],
    };
    if (centralFilter) {
      searchFilter.$and = [centralFilter];
    }

    const products = await this.productModel
      .find(searchFilter)
      .populate('categoryId', 'name')
      .populate('brandId', 'name')
      .populate('unitId', 'name abbreviation')
      .select(
        'name sku barcode image images price stock categoryId brandId unitId hasVariants isWeighted trackBatches',
      )
      .limit(20)
      .lean();

    return Promise.all(products.map((p) => this.mapProductForPos(p, tenantId, storeId)));
  }

  /** Enrich sale line items with product metadata scoped to tenant + store. */
  private async enrichSaleItems(
    tenantId: string,
    storeId: string,
    items: SaleItemDto[],
  ): Promise<Array<SaleItemDto & { unitCost: number; lineCost: number; costSource: string }>> {
    const tenantObjId = new Types.ObjectId(tenantId);
    const storeObjId = new Types.ObjectId(storeId);
    const enriched: Array<
      SaleItemDto & { unitCost: number; lineCost: number; costSource: string }
    > = [];
    for (const item of items) {
      let sku = item.sku || '';
      let barcode = item.barcode || '';
      let categoryName = item.categoryName || '';
      let brandName = item.brandName || '';
      let productName = item.productName;
      let price = item.price;
      let unitCost = 0;
      let costSource = 'product';

      if (item.productId) {
        const product = await this.productModel
          .findOne({
            _id: new Types.ObjectId(item.productId),
            tenantId: tenantObjId,
            storeId: storeObjId,
            ...notDeletedFilter(),
          })
          .populate('categoryId', 'name')
          .populate('brandId', 'name')
          .lean();
        if (product) {
          productName = productName || (product as any).name;
          if (item.variantId) {
            const variant = await this.variantModel
              .findOne({
                _id: new Types.ObjectId(item.variantId),
                productId: product._id,
                tenantId: tenantObjId,
                storeId: storeObjId,
              })
              .lean();
            if (variant) {
              price = price ?? (variant as any).price;
              sku = sku || (variant as any).sku || '';
              unitCost = roundMoney(
                (variant as any).costPrice ??
                  (variant as any).cost ??
                  (product as any).costPrice ??
                  0,
              );
              costSource = 'variant';
            }
          } else {
            price = price ?? (product as any).price;
            sku = sku || (product as any).sku || '';
            unitCost = roundMoney((product as any).costPrice ?? 0);
            costSource = 'product';
          }
          barcode = barcode || (product as any).barcode || '';
          categoryName =
            categoryName ||
            (typeof (product as any).categoryId === 'object'
              ? (product as any).categoryId?.name
              : '') ||
            '';
          brandName =
            brandName ||
            (typeof (product as any).brandId === 'object' ? (product as any).brandId?.name : '') ||
            '';
        }
      }

      enriched.push({
        ...item,
        productName,
        price,
        unitCost,
        lineCost: roundMoney(unitCost * normalizeQuantity(item.quantity)),
        costSource,
        sku,
        barcode,
        categoryName,
        brandName,
      });
    }
    return enriched;
  }

  // ─── Hold Order ─────────────────────────────────────────────────────

  async holdOrder(tenantId: string, storeId: string, cashierId: string, dto: HoldOrderDto) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const cashierObjId = new Types.ObjectId(cashierId);
    const terminalId = dto.terminalId || 'default';

    const totals = calculateCartTotals({
      items: dto.items,
      globalDiscount: dto.globalDiscount ?? 0,
      discountType: (dto.discountType as 'percent' | 'flat') || 'percent',
      taxRate: dto.taxRate ?? 0,
    });
    if (dto.discount != null || dto.tax != null) {
      assertTotalsMatch(totals, dto.discount ?? totals.discountAmount, dto.tax ?? totals.taxAmount);
    }

    const held = await this.heldOrderModel.create({
      cashierId: cashierObjId,
      storeId: storeObjId,
      tenantId: tenantObjId,
      terminalId,
      customerId: dto.customerId ? new Types.ObjectId(dto.customerId) : null,
      items: dto.items.map((i) => ({
        productId: new Types.ObjectId(i.productId),
        variantId: i.variantId || null,
        productName: i.productName,
        quantity: i.quantity,
        price: i.price,
        discount: i.discount || 0,
      })),
      discount: totals.discountAmount,
      discountType: dto.discountType || 'percent',
      globalDiscount: dto.globalDiscount ?? 0,
      taxRate: dto.taxRate ?? 0,
      tax: totals.taxAmount,
      subtotal: totals.subtotal,
      total: totals.grandTotal,
      status: 'held',
      note: dto.note || '',
    });

    return { _id: held._id.toString(), total: held.total, itemCount: held.items.length };
  }

  // ─── Get Held Orders ────────────────────────────────────────────────

  async getHeldOrders(tenantId: string, storeId: string, cashierId: string) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const cashierObjId = new Types.ObjectId(cashierId);

    const orders = await this.heldOrderModel
      .find({
        tenantId: tenantObjId,
        storeId: storeObjId,
        cashierId: cashierObjId,
        status: 'held',
      })
      .sort({ createdAt: -1 })
      .populate('customerId', 'name')
      .lean();

    return orders.map((o) => ({
      _id: o._id.toString(),
      items: o.items,
      total: o.total,
      subtotal: o.subtotal,
      discount: o.discount,
      discountType: (o as any).discountType || 'percent',
      globalDiscount: (o as any).globalDiscount ?? 0,
      taxRate: (o as any).taxRate ?? 0,
      tax: o.tax,
      customer: (o.customerId as any)?.name || null,
      note: o.note,
      createdAt: (o as any).createdAt,
    }));
  }

  // ─── Delete Held Order ──────────────────────────────────────────────

  async deleteHeldOrder(tenantId: string, storeId: string, cashierId: string, orderId: string) {
    const result = await this.heldOrderModel.deleteOne({
      _id: new Types.ObjectId(orderId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      cashierId: new Types.ObjectId(cashierId),
      status: 'held',
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Held order not found');
    }
    return { deleted: true };
  }

  // ─── Create Sale (atomic stock) ────────────────────────────────────

  private isTransactionUnsupported(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return (
      msg.includes('Transaction numbers are only allowed') ||
      msg.includes('ReplicaSetNoPrimary') ||
      msg.includes('replica set')
    );
  }

  private async persistSale(
    tenantId: string,
    storeId: string,
    cashierId: string,
    dto: CreateSaleDto,
    session?: import('mongoose').ClientSession | null,
    plan = 'basic',
    exchangeMeta?: { exchangeId?: string; returnRef?: string },
  ) {
    const storeObjId = new Types.ObjectId(storeId);
    const tenantObjId = new Types.ObjectId(tenantId);
    const terminalId = dto.terminalId || 'default';
    const sessionOpts = session ? { session } : {};
    const settings = await this.getSettings(tenantId, storeId, terminalId);
    const requireShift = this.resolveRequireShift(settings, plan);
    let activeShiftId: string | null = null;

    if (requireShift) {
      const shift = await this.shiftService.requireOpenShift(
        tenantId,
        storeId,
        cashierId,
        terminalId,
      );
      activeShiftId = shift._id;
    }

    if (!dto.items?.length) {
      throw new BadRequestException('Cart is empty');
    }

    for (const item of dto.items) {
      if (!Types.ObjectId.isValid(item.productId)) {
        throw new BadRequestException(`Invalid product ID for "${item.productName}"`);
      }

      const filter = {
        _id: new Types.ObjectId(item.productId),
        tenantId: tenantObjId,
        storeId: storeObjId,
        isActive: true,
      };

      const product = await this.productModel
        .findOne(filter)
        .session(session ?? null)
        .lean();
      if (!product) {
        throw new NotFoundException(
          `Product "${item.productName}" was not found in this store. Refresh the product list and try again.`,
        );
      }

      if (item.variantId) {
        const variant = await this.variantModel
          .findOne({
            _id: new Types.ObjectId(item.variantId),
            productId: product._id,
            tenantId: tenantObjId,
            storeId: storeObjId,
            isActive: true,
          })
          .session(session ?? null)
          .lean();
        if (!variant) {
          throw new NotFoundException(`Variant not found for "${item.productName}"`);
        }
      } else if ((product as any).hasVariants) {
        throw new BadRequestException(
          `"${item.productName}" requires a size/color selection. Pick a variant and try again.`,
        );
      }

      await this.stockLedger.ensureLedgerSeededFromProduct(
        tenantId,
        storeId,
        item.productId,
        item.variantId || null,
        session,
      );

      const available = await this.stockLedger.getAvailableQuantity(
        tenantId,
        storeId,
        item.productId,
        item.variantId || null,
        session,
      );

      if (available < item.quantity) {
        throw new ConflictException(
          `Insufficient stock for "${item.productName}" (${available} available, ${item.quantity} requested). ` +
            `Update stock under Inventory or Products, then try again.`,
        );
      }
    }

    const { subtotal } = calculateCartTotals({
      items: dto.items,
      globalDiscount: 0,
      discountType: 'flat',
      taxRate: 0,
    });

    let loyaltyDiscount = 0;
    const loyaltyPointsRedeemed = dto.loyaltyPointsRedeemed || 0;
    if (loyaltyPointsRedeemed > 0 && dto.customerId) {
      loyaltyDiscount = await this.validateLoyaltyRedeem(
        tenantId,
        storeId,
        dto.customerId,
        loyaltyPointsRedeemed,
        settings,
      );
    }

    const discountAmount = roundMoney((dto.discount || 0) + loyaltyDiscount);
    const taxAmount = roundMoney(dto.tax || 0);
    if (discountAmount > subtotal) {
      throw new BadRequestException('Discount cannot exceed subtotal');
    }
    const total = roundMoney(subtotal - discountAmount + taxAmount);
    const totalPaid = roundMoney(dto.payments.reduce((sum, p) => sum + p.amount, 0));

    if (totalPaid < total - 0.01) {
      throw new BadRequestException(
        `Payment total (${totalPaid}) is less than sale total (${total}). Add the remaining amount.`,
      );
    }

    let paymentStatus: string = 'paid';
    if (totalPaid < total) paymentStatus = 'partial';
    const retainedPayments = this.normalizeRetainedPayments(dto.payments, total);

    const orderNumber = await allocateOrderNumber(
      this.saleOrderModel,
      this.counterModel,
      tenantObjId,
      storeObjId,
      session ?? null,
    );

    const saleItems = await this.enrichSaleItems(tenantId, storeId, dto.items);
    // allowMissing: a customer at the till is never blocked by a missing FX rate.
    // The sale records exchangeRateMissing and is back-converted once a rate exists.
    const currencySnapshot = await this.currencyService.resolveSnapshot(
      tenantId,
      storeId,
      new Date(),
      { allowMissing: true },
    );

    const salePayload = {
      orderNumber,
      totalAmount: total,
      currency: currencySnapshot.currency,
      baseCurrency: currencySnapshot.baseCurrency,
      exchangeRate: currencySnapshot.exchangeRate,
      exchangeRateDate: currencySnapshot.exchangeRateDate,
      exchangeRateMissing: currencySnapshot.exchangeRateMissing,
      baseTotalAmount: this.currencyService.toBase(total, currencySnapshot),
      subtotal,
      baseSubtotal: this.currencyService.toBase(subtotal, currencySnapshot),
      discount: discountAmount,
      baseDiscount: this.currencyService.toBase(discountAmount, currencySnapshot),
      tax: taxAmount,
      baseTax: this.currencyService.toBase(taxAmount, currencySnapshot),
      status: 'completed',
      paymentStatus,
      type: 'sale',
      date: new Date(),
      customerId: dto.customerId ? new Types.ObjectId(dto.customerId) : null,
      cashierId: new Types.ObjectId(cashierId),
      terminalId,
      shiftId: activeShiftId ? new Types.ObjectId(activeShiftId) : null,
      exchangeId: exchangeMeta?.exchangeId || null,
      returnRef: exchangeMeta?.returnRef ? new Types.ObjectId(exchangeMeta.returnRef) : null,
      loyaltyPointsRedeemed: loyaltyPointsRedeemed || 0,
      items: saleItems.map((i) => ({
        productId: new Types.ObjectId(i.productId),
        variantId: i.variantId || null,
        productName: i.productName,
        quantity: normalizeQuantity(i.quantity),
        price: roundMoney(i.price),
        discount: roundMoney(i.discount || 0),
        unitCost: roundMoney(i.unitCost),
        lineCost: roundMoney(i.lineCost),
        baseUnitCost: this.currencyService.toBase(roundMoney(i.unitCost), currencySnapshot),
        baseLineCost: this.currencyService.toBase(roundMoney(i.lineCost), currencySnapshot),
        costSource: i.costSource,
        sku: i.sku || '',
        barcode: i.barcode || '',
        categoryName: i.categoryName || '',
        brandName: i.brandName || '',
      })),
      payments: retainedPayments.map((p) => ({
        method: p.method,
        amount: roundMoney(p.amount),
        baseAmount: this.currencyService.toBase(roundMoney(p.amount), currencySnapshot),
        transactionId: p.transactionId || null,
      })),
      storeId: storeObjId,
      tenantId: tenantObjId,
    };

    const saleOrder = await this.saleOrderModel.create([salePayload], sessionOpts);
    const sale = saleOrder[0];

    for (const item of dto.items) {
      await this.stockLedger.deductForSale(
        tenantId,
        storeId,
        item.productId,
        item.variantId || null,
        item.quantity,
        sale._id.toString(),
        cashierId,
        session,
      );
    }

    if (loyaltyPointsRedeemed > 0 && dto.customerId) {
      await this.recordLoyaltyRedeem(
        tenantId,
        storeId,
        dto.customerId,
        loyaltyPointsRedeemed,
        sale._id.toString(),
        cashierId,
        session,
      );
    }

    if (dto.customerId) {
      await this.awardLoyaltyPoints(
        tenantId,
        storeId,
        dto.customerId,
        total,
        sale._id.toString(),
        cashierId,
        settings,
        session,
      );
    }

    if (activeShiftId) {
      await this.shiftService.recordSaleOnShift(activeShiftId, total, retainedPayments, session);
    }
    await this.postSaleJournal(tenantId, storeId, cashierId, sale, session);

    this.checkLowStockAfterSale(tenantId, storeId, cashierId, dto.items).catch(() => {});

    this.webhookDispatch.emit(tenantId, 'sale.created', {
      saleId: sale._id.toString(),
      orderNumber: sale.orderNumber,
      totalAmount: total,
      storeId,
    });

    return {
      _id: sale._id.toString(),
      orderNumber: sale.orderNumber,
      items: sale.items,
      subtotal,
      discount: discountAmount,
      tax: taxAmount,
      total,
      paymentStatus,
      payments: retainedPayments,
      date: sale.date,
    };
  }

  async createSale(
    tenantId: string,
    storeId: string,
    cashierId: string,
    dto: CreateSaleDto,
    plan = 'basic',
  ) {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();
      const result = await this.persistSale(tenantId, storeId, cashierId, dto, session, plan);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      if (this.isTransactionUnsupported(error)) {
        return this.persistSale(tenantId, storeId, cashierId, dto, null, plan);
      }
      throw error;
    } finally {
      void session.endSession();
    }
  }

  // ─── Customer Search ────────────────────────────────────────────────

  async searchCustomers(tenantId: string, storeId: string, query: string) {
    if (!query || query.length < 1) return [];

    const regex = new RegExp(escapeRegex(query), 'i');
    return this.customerModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      })
      .select('name email phone')
      .limit(10)
      .lean()
      .then((customers) =>
        customers.map((c) => ({
          _id: c._id.toString(),
          name: c.name,
          email: c.email,
          phone: c.phone,
          loyaltyPoints: (c as any).loyaltyPoints || 0,
        })),
      );
  }

  // ─── Receipt ────────────────────────────────────────────────────────

  async getReceipt(tenantId: string, storeId: string, saleId: string) {
    const sale = await this.saleOrderModel
      .findOne({
        _id: new Types.ObjectId(saleId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .populate('customerId', 'name email phone')
      .lean();

    if (!sale) throw new NotFoundException('Sale not found');

    const settings = await this.posSettingsModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .lean();

    const subtotal =
      sale.subtotal ??
      sale.items.reduce((sum, i) => sum + i.quantity * i.price - (i.discount || 0), 0);
    const discount = sale.discount ?? 0;
    const tax = sale.tax ?? 0;
    const taxableBase = Math.max(0, subtotal - discount);
    let taxRate = 0;
    if (taxableBase > 0 && tax > 0) {
      taxRate = Math.round((tax / taxableBase) * 10000) / 100;
    }

    return {
      orderNumber: sale.orderNumber,
      date: sale.date,
      items: sale.items.map((i: any) => ({
        name: i.productName,
        quantity: i.quantity,
        price: i.price,
        discount: i.discount || 0,
        lineTotal: i.quantity * i.price - (i.discount || 0),
        sku: i.sku || '',
        barcode: i.barcode || '',
        categoryName: i.categoryName || '',
        brandName: i.brandName || '',
      })),
      subtotal,
      discount,
      tax,
      taxRate,
      taxableBase,
      total: sale.totalAmount,
      payments: (sale.payments || []).map((p: any) => ({
        method: p.method,
        amount: p.amount,
      })),
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      terminalId: sale.terminalId || 'POS 001',
      customer: sale.customerId
        ? {
            name: (sale.customerId as any).name,
            email: (sale.customerId as any).email,
            phone: (sale.customerId as any).phone,
          }
        : null,
      receiptHeader: settings?.receiptHeader || '',
      receiptFooter: settings?.receiptFooter || 'Thank you for your purchase!',
    };
  }

  // ─── POS Settings ──────────────────────────────────────────────────

  async getSettings(tenantId: string, storeId: string, terminalId: string = 'default') {
    let settings = await this.posSettingsModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        terminalId,
      })
      .lean();

    if (!settings) {
      settings = {
        paymentMethods: ['cash', 'card', 'mobile'],
        defaultTaxRate: 0,
        printReceiptOnSale: true,
        receiptHeader: '',
        receiptFooter: 'Thank you for your purchase!',
        receiptSize: '80mm',
        printerConnectionType: 'browser',
        printerName: '',
        printerHost: '',
        printerPort: 9100,
        printerPaperSize: '80mm',
        cashDrawerEnabled: false,
        autoOpenCashDrawer: false,
        requireShift: null,
        loyaltyEarnRate: 0.01,
        loyaltyRedeemRate: 100,
      } as any;
    }

    return settings;
  }

  async updateSettings(
    tenantId: string,
    storeId: string,
    dto: UpdatePosSettingsDto,
    terminalId: string = 'default',
  ) {
    const result = await this.posSettingsModel.findOneAndUpdate(
      {
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        terminalId,
      },
      { $set: dto },
      { upsert: true, new: true },
    );

    return result;
  }

  private async checkLowStockAfterSale(
    tenantId: string,
    storeId: string,
    userId: string,
    items: any[],
  ) {
    for (const item of items) {
      const available = await this.stockLedger.getAvailableQuantity(
        tenantId,
        storeId,
        item.productId,
        item.variantId || null,
      );
      const product = await this.productModel
        .findOne({
          _id: item.productId,
          tenantId: new Types.ObjectId(tenantId),
          storeId: new Types.ObjectId(storeId),
          ...notDeletedFilter(),
        })
        .lean();
      const name = item.productName || (product as any)?.name || 'Product';
      if (available <= LOW_STOCK_THRESHOLD) {
        await this.notificationsService.notifyLowStock(tenantId, userId, name, available);
        this.webhookDispatch.emit(tenantId, 'stock.low', {
          productId: item.productId,
          variantId: item.variantId || null,
          productName: name,
          quantity: available,
          storeId,
        });
      }
    }
  }

  async evaluatePromotions(
    tenantId: string,
    storeId: string,
    payload: { items: SaleItemDto[]; customerId?: string; subtotal?: number },
  ) {
    return this.promotionService.evaluate(tenantId, storeId, payload);
  }

  async lookupSaleForReturn(tenantId: string, storeId: string, orderNumber: string) {
    const sale = await this.saleOrderModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        orderNumber: orderNumber.trim(),
        type: 'sale',
      })
      .populate('customerId', 'name email phone')
      .lean();

    if (!sale) throw new NotFoundException('Sale not found');

    return {
      _id: sale._id.toString(),
      orderNumber: sale.orderNumber,
      date: sale.date,
      total: sale.totalAmount,
      customer: sale.customerId
        ? {
            name: (sale.customerId as any).name,
            email: (sale.customerId as any).email,
            phone: (sale.customerId as any).phone,
          }
        : null,
      items: sale.items.map((i: any) => ({
        productId: i.productId.toString(),
        variantId: i.variantId?.toString?.() || null,
        productName: i.productName,
        quantity: i.quantity,
        price: i.price,
        sku: i.sku || '',
      })),
    };
  }

  private async computeReturnAmounts(
    tenantId: Types.ObjectId,
    storeId: Types.ObjectId,
    originalSale: any,
    dto: { items: SaleItemDto[] },
    session: import('mongoose').ClientSession,
  ) {
    const priorReturns = await this.saleOrderModel
      .find({ tenantId, storeId, type: 'return', returnRef: originalSale._id })
      .session(session)
      .lean();
    const returnedQtyByLine = new Map<string, number>();
    for (const row of priorReturns) {
      for (const item of row.items || []) {
        const key = `${item.productId.toString()}:${item.variantId?.toString?.() || ''}`;
        returnedQtyByLine.set(key, (returnedQtyByLine.get(key) || 0) + Number(item.quantity || 0));
      }
    }

    const originalSubtotal = Math.max(0, Number(originalSale.subtotal || 0));
    const originalDiscount = Math.max(0, Number(originalSale.discount || 0));
    const originalTax = Math.max(0, Number(originalSale.tax || 0));
    const normalizedItems: Array<
      SaleItemDto & {
        price: number;
        quantity: number;
        unitCost: number;
        lineCost: number;
        costSource: string;
      }
    > = [];
    let returnBase = 0;

    for (const returnItem of dto.items) {
      const origItem = originalSale.items.find(
        (i) =>
          i.productId.toString() === returnItem.productId &&
          String(i.variantId?.toString?.() || '') === String(returnItem.variantId || ''),
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
      const unitCost = roundMoney(Number((origItem as any).unitCost || 0));
      returnBase = roundMoney(returnBase + unitNet * quantity);
      normalizedItems.push({
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
        ? roundMoney(Math.min(originalDiscount, (originalDiscount * returnBase) / originalSubtotal))
        : 0;
    const taxableOriginal = Math.max(0, originalSubtotal - originalDiscount);
    const taxableReturn = Math.max(0, returnBase - discountShare);
    const taxShare =
      taxableOriginal > 0 ? roundMoney((originalTax * taxableReturn) / taxableOriginal) : 0;
    const refundTotal = roundMoney(taxableReturn + taxShare);

    const allReturned = originalSale.items.every((origItem) => {
      const key = `${origItem.productId.toString()}:${origItem.variantId?.toString?.() || ''}`;
      const prior = returnedQtyByLine.get(key) || 0;
      const added = normalizedItems
        .filter(
          (ret) =>
            ret.productId === origItem.productId.toString() &&
            String(ret.variantId || '') === String(origItem.variantId?.toString?.() || ''),
        )
        .reduce((sum, ret) => sum + ret.quantity, 0);
      return prior + added >= Number(origItem.quantity || 0);
    });

    return {
      items: normalizedItems,
      returnBase,
      discountShare,
      taxShare,
      refundTotal,
      allReturned,
    };
  }

  async processPosReturn(
    tenantId: string,
    storeId: string,
    userId: string,
    saleId: string,
    dto: { items: SaleItemDto[]; reason: string; notes?: string },
    plan = 'basic',
  ) {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      const tid = new Types.ObjectId(tenantId);
      const sid = new Types.ObjectId(storeId);
      const terminalId = 'default';
      const settings = await this.getSettings(tenantId, storeId, terminalId);
      let activeShiftId: string | null = null;
      if (this.resolveRequireShift(settings, plan)) {
        const shift = await this.shiftService.requireOpenShift(
          tenantId,
          storeId,
          userId,
          terminalId,
        );
        activeShiftId = shift._id;
      }

      const originalSale = await this.saleOrderModel
        .findOne({
          _id: new Types.ObjectId(saleId),
          tenantId: tid,
          storeId: sid,
          type: 'sale',
        })
        .session(session);

      if (!originalSale) throw new NotFoundException('Original sale not found');

      const returnCalc = await this.computeReturnAmounts(tid, sid, originalSale, dto, session);
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
      const orderNumber = await allocateOrderNumber(
        this.saleOrderModel,
        this.counterModel,
        tid,
        sid,
        session,
      );

      const [returnOrder] = await this.saleOrderModel.create(
        [
          {
            orderNumber,
            totalAmount: -returnCalc.refundTotal,
            currency: returnCurrencySnapshot.currency,
            baseCurrency: returnCurrencySnapshot.baseCurrency,
            exchangeRate: returnCurrencySnapshot.exchangeRate,
            exchangeRateDate: returnCurrencySnapshot.exchangeRateDate,
            baseTotalAmount: -this.currencyService.toBase(
              returnCalc.refundTotal,
              returnCurrencySnapshot,
            ),
            subtotal: -returnCalc.returnBase,
            baseSubtotal: -this.currencyService.toBase(
              returnCalc.returnBase,
              returnCurrencySnapshot,
            ),
            discount: -returnCalc.discountShare,
            baseDiscount: -this.currencyService.toBase(
              returnCalc.discountShare,
              returnCurrencySnapshot,
            ),
            tax: -returnCalc.taxShare,
            baseTax: -this.currencyService.toBase(returnCalc.taxShare, returnCurrencySnapshot),
            status: 'refunded',
            paymentStatus: 'paid',
            type: 'return',
            date: new Date(),
            customerId: originalSale.customerId || null,
            cashierId: new Types.ObjectId(userId),
            terminalId,
            shiftId: activeShiftId ? new Types.ObjectId(activeShiftId) : null,
            items: returnCalc.items.map((i) => ({
              productId: new Types.ObjectId(i.productId),
              variantId: i.variantId ? new Types.ObjectId(i.variantId) : null,
              productName: i.productName,
              quantity: i.quantity,
              price: i.price,
              discount: 0,
              unitCost: i.unitCost,
              lineCost: i.lineCost,
              baseUnitCost: this.currencyService.toBase(i.unitCost, returnCurrencySnapshot),
              baseLineCost: this.currencyService.toBase(i.lineCost, returnCurrencySnapshot),
              costSource: i.costSource,
              sku: i.sku || '',
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

      for (const item of returnCalc.items) {
        await this.stockLedger.restoreForReturn(
          tenantId,
          storeId,
          item.productId,
          item.variantId || null,
          item.quantity,
          returnOrder._id.toString(),
          userId,
          session,
        );
      }

      originalSale.status = returnCalc.allReturned ? 'refunded' : 'completed';
      await originalSale.save({ session });

      if (originalSale.customerId) {
        const pointsToReverse = Math.floor(
          returnCalc.refundTotal * ((settings as any)?.loyaltyEarnRate ?? 0.01),
        );
        if (pointsToReverse > 0) {
          await this.reverseLoyaltyPoints(
            tenantId,
            storeId,
            originalSale.customerId.toString(),
            pointsToReverse,
            returnOrder._id.toString(),
            userId,
            session,
          );
        }
      }

      if (activeShiftId) {
        await this.shiftService.recordRefundOnShift(activeShiftId, returnCalc.refundTotal, session);
      }
      await this.postSaleJournal(tenantId, storeId, userId, returnOrder, session);

      await session.commitTransaction();

      return {
        _id: returnOrder._id.toString(),
        orderNumber: returnOrder.orderNumber,
        refundAmount: returnCalc.refundTotal,
      };
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      void session.endSession();
    }
  }

  async processExchange(
    tenantId: string,
    storeId: string,
    userId: string,
    dto: CreateExchangeDto,
    plan = 'basic',
  ) {
    if (!dto.returnItems?.length || !dto.newItems?.length) {
      throw new BadRequestException('Exchange requires both return and new items');
    }

    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      const originalSale = await this.saleOrderModel
        .findOne({
          _id: new Types.ObjectId(dto.saleId),
          tenantId: new Types.ObjectId(tenantId),
          storeId: new Types.ObjectId(storeId),
          type: 'sale',
        })
        .session(session)
        .lean();

      const returnResult = await this.processPosReturnInternal(
        tenantId,
        storeId,
        userId,
        dto.saleId,
        { items: dto.returnItems, reason: dto.reason, notes: dto.notes },
        plan,
        session,
      );

      const exchangeId = randomBytes(8).toString('hex');
      const returnSubtotal = returnResult.refundAmount;
      const newSubtotal = dto.newItems.reduce(
        (s, i) => s + normalizeQuantity(i.quantity) * roundMoney(i.price),
        0,
      );
      const difference = roundMoney(newSubtotal - returnSubtotal);

      const payments = dto.payments?.length
        ? dto.payments
        : difference > 0
          ? [{ method: 'cash', amount: difference }]
          : difference < 0
            ? [{ method: 'cash', amount: 0 }]
            : [{ method: 'cash', amount: 0 }];

      const totalPaid = roundMoney(payments.reduce((s, p) => s + p.amount, 0));
      if (difference > 0 && totalPaid < difference - 0.01) {
        throw new BadRequestException(
          `Payment (${totalPaid}) is less than amount due (${difference}) for exchange`,
        );
      }

      const saleDto: CreateSaleDto = {
        items: dto.newItems,
        payments,
        discount: difference < 0 ? Math.abs(difference) : 0,
        tax: 0,
        terminalId: dto.terminalId,
        customerId: originalSale?.customerId?.toString?.() || undefined,
      };

      const saleResult = await this.persistSale(tenantId, storeId, userId, saleDto, session, plan, {
        exchangeId,
        returnRef: returnResult._id,
      });

      await this.saleOrderModel.updateOne(
        { _id: new Types.ObjectId(returnResult._id) },
        { $set: { exchangeId } },
        { session },
      );

      await session.commitTransaction();

      return {
        exchangeId,
        return: returnResult,
        sale: saleResult,
        returnAmount: returnSubtotal,
        newAmount: roundMoney(newSubtotal),
        difference,
      };
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      if (this.isTransactionUnsupported(error)) {
        throw error;
      }
      throw error;
    } finally {
      void session.endSession();
    }
  }

  private async processPosReturnInternal(
    tenantId: string,
    storeId: string,
    userId: string,
    saleId: string,
    dto: { items: SaleItemDto[]; reason: string; notes?: string },
    plan: string,
    session: import('mongoose').ClientSession,
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const terminalId = dto.notes?.includes('terminal:')
      ? dto.notes.split('terminal:')[1]
      : 'default';
    const settings = await this.getSettings(tenantId, storeId, terminalId);
    let activeShiftId: string | null = null;
    if (this.resolveRequireShift(settings, plan)) {
      const shift = await this.shiftService.requireOpenShift(tenantId, storeId, userId, terminalId);
      activeShiftId = shift._id;
    }

    const originalSale = await this.saleOrderModel
      .findOne({
        _id: new Types.ObjectId(saleId),
        tenantId: tid,
        storeId: sid,
        type: 'sale',
      })
      .session(session);

    if (!originalSale) throw new NotFoundException('Original sale not found');

    const returnCalc = await this.computeReturnAmounts(tid, sid, originalSale, dto, session);
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
    const orderNumber = await allocateOrderNumber(
      this.saleOrderModel,
      this.counterModel,
      tid,
      sid,
      session,
    );

    const [returnOrder] = await this.saleOrderModel.create(
      [
        {
          orderNumber,
          totalAmount: -returnCalc.refundTotal,
          currency: returnCurrencySnapshot.currency,
          baseCurrency: returnCurrencySnapshot.baseCurrency,
          exchangeRate: returnCurrencySnapshot.exchangeRate,
          exchangeRateDate: returnCurrencySnapshot.exchangeRateDate,
          baseTotalAmount: -this.currencyService.toBase(
            returnCalc.refundTotal,
            returnCurrencySnapshot,
          ),
          subtotal: -returnCalc.returnBase,
          baseSubtotal: -this.currencyService.toBase(returnCalc.returnBase, returnCurrencySnapshot),
          discount: -returnCalc.discountShare,
          baseDiscount: -this.currencyService.toBase(
            returnCalc.discountShare,
            returnCurrencySnapshot,
          ),
          tax: -returnCalc.taxShare,
          baseTax: -this.currencyService.toBase(returnCalc.taxShare, returnCurrencySnapshot),
          status: 'refunded',
          paymentStatus: 'paid',
          type: 'return',
          date: new Date(),
          customerId: originalSale.customerId || null,
          cashierId: new Types.ObjectId(userId),
          terminalId,
          shiftId: activeShiftId ? new Types.ObjectId(activeShiftId) : null,
          items: returnCalc.items.map((i) => ({
            productId: new Types.ObjectId(i.productId),
            variantId: i.variantId ? new Types.ObjectId(i.variantId) : null,
            productName: i.productName,
            quantity: i.quantity,
            price: i.price,
            discount: 0,
            unitCost: i.unitCost,
            lineCost: i.lineCost,
            baseUnitCost: this.currencyService.toBase(i.unitCost, returnCurrencySnapshot),
            baseLineCost: this.currencyService.toBase(i.lineCost, returnCurrencySnapshot),
            costSource: i.costSource,
            sku: i.sku || '',
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

    for (const item of returnCalc.items) {
      await this.stockLedger.restoreForReturn(
        tenantId,
        storeId,
        item.productId,
        item.variantId || null,
        item.quantity,
        returnOrder._id.toString(),
        userId,
        session,
      );
    }

    originalSale.status = returnCalc.allReturned ? 'refunded' : 'completed';
    await originalSale.save({ session });

    if (activeShiftId) {
      await this.shiftService.recordRefundOnShift(activeShiftId, returnCalc.refundTotal, session);
    }
    await this.postSaleJournal(tenantId, storeId, userId, returnOrder, session);

    return {
      _id: returnOrder._id.toString(),
      orderNumber: returnOrder.orderNumber,
      refundAmount: returnCalc.refundTotal,
    };
  }

  async loyaltyRedeemPreview(
    tenantId: string,
    storeId: string,
    customerId: string,
    points: number,
    terminalId = 'default',
  ) {
    const settings = await this.getSettings(tenantId, storeId, terminalId);
    const customer = await this.customerModel
      .findOne({
        _id: new Types.ObjectId(customerId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .lean();

    if (!customer) throw new NotFoundException('Customer not found');

    const available = (customer as any).loyaltyPoints || 0;
    const pointsToUse = Math.min(points, available);
    const redeemRate = (settings as any)?.loyaltyRedeemRate ?? 100;
    const discountAmount = roundMoney(pointsToUse / redeemRate);

    return {
      pointsRequested: points,
      pointsAvailable: available,
      pointsToUse,
      discountAmount,
      redeemRate,
    };
  }

  private async validateLoyaltyRedeem(
    tenantId: string,
    storeId: string,
    customerId: string,
    points: number,
    _settings: any,
  ): Promise<number> {
    const preview = await this.loyaltyRedeemPreview(tenantId, storeId, customerId, points);
    if (preview.pointsToUse < points) {
      throw new BadRequestException(
        `Insufficient loyalty points (available: ${preview.pointsAvailable})`,
      );
    }
    return preview.discountAmount;
  }

  private async recordLoyaltyRedeem(
    tenantId: string,
    storeId: string,
    customerId: string,
    points: number,
    saleId: string,
    userId: string,
    session?: import('mongoose').ClientSession | null,
  ) {
    await this.customerModel.updateOne(
      {
        _id: new Types.ObjectId(customerId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      { $inc: { loyaltyPoints: -points } },
      session ? { session } : {},
    );

    await this.loyaltyTxModel.create(
      [
        {
          tenantId: new Types.ObjectId(tenantId),
          storeId: new Types.ObjectId(storeId),
          customerId: new Types.ObjectId(customerId),
          type: 'redeem',
          points: -points,
          saleId: new Types.ObjectId(saleId),
          notes: 'Redeemed at POS',
          createdBy: new Types.ObjectId(userId),
          date: new Date(),
        },
      ],
      session ? { session } : {},
    );
  }

  private async reverseLoyaltyPoints(
    tenantId: string,
    storeId: string,
    customerId: string,
    points: number,
    returnId: string,
    userId: string,
    session?: import('mongoose').ClientSession | null,
  ) {
    await this.customerModel.updateOne(
      {
        _id: new Types.ObjectId(customerId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      { $inc: { loyaltyPoints: -points } },
      session ? { session } : {},
    );

    await this.loyaltyTxModel.create(
      [
        {
          tenantId: new Types.ObjectId(tenantId),
          storeId: new Types.ObjectId(storeId),
          customerId: new Types.ObjectId(customerId),
          type: 'adjust',
          points: -points,
          saleId: new Types.ObjectId(returnId),
          notes: 'Reversed on return',
          createdBy: new Types.ObjectId(userId),
          date: new Date(),
        },
      ],
      session ? { session } : {},
    );
  }

  private async awardLoyaltyPoints(
    tenantId: string,
    storeId: string,
    customerId: string,
    saleTotal: number,
    saleId: string,
    userId: string,
    settings: any,
    session?: import('mongoose').ClientSession | null,
  ) {
    const earnRate = settings?.loyaltyEarnRate ?? 0.01;
    const points = Math.floor(saleTotal * earnRate);
    if (points <= 0) return;

    await this.customerModel.updateOne(
      {
        _id: new Types.ObjectId(customerId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      { $inc: { loyaltyPoints: points } },
      session ? { session } : {},
    );

    await this.loyaltyTxModel.create(
      [
        {
          tenantId: new Types.ObjectId(tenantId),
          storeId: new Types.ObjectId(storeId),
          customerId: new Types.ObjectId(customerId),
          type: 'earn',
          points,
          saleId: new Types.ObjectId(saleId),
          notes: 'Earned on sale',
          createdBy: new Types.ObjectId(userId),
          date: new Date(),
        },
      ],
      session ? { session } : {},
    );
  }
}
