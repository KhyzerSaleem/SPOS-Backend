import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Plan, PlanDocument } from '../../database/schemas/plan.schema';
import { Subscription, SubscriptionDocument } from '../../database/schemas/subscription.schema';
import {
  BillingInvoice,
  BillingInvoiceDocument,
} from '../../database/schemas/billing-invoice.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Role, RoleDocument, DEFAULT_ROLES_DATA } from '../../database/schemas/role.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../../database/schemas/product-variant.schema';
import { Category, CategoryDocument } from '../../database/schemas/category.schema';
import { Brand, BrandDocument } from '../../database/schemas/brand.schema';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { CustomerGroup, CustomerGroupDocument } from '../../database/schemas/customer-group.schema';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { HeldOrder, HeldOrderDocument } from '../../database/schemas/held-order.schema';
import { Invite, InviteDocument } from '../../database/schemas/invite.schema';
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
import { Supplier, SupplierDocument } from '../../database/schemas/supplier.schema';
import { PurchaseOrder, PurchaseOrderDocument } from '../../database/schemas/purchase-order.schema';
import {
  PurchaseReturn,
  PurchaseReturnDocument,
} from '../../database/schemas/purchase-return.schema';
import {
  GoodsReceivedNote,
  GoodsReceivedNoteDocument,
} from '../../database/schemas/goods-received-note.schema';
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from '../../database/schemas/supplier-invoice.schema';
import { Expense, ExpenseDocument } from '../../database/schemas/expense.schema';
import { PosSettings, PosSettingsDocument } from '../../database/schemas/pos-settings.schema';
import { PosShift, PosShiftDocument } from '../../database/schemas/pos-shift.schema';
import { Notification, NotificationDocument } from '../../database/schemas/notification.schema';
import { AuditLog, AuditLogDocument } from '../../database/schemas/audit-log.schema';
import {
  WebhookSubscription,
  WebhookSubscriptionDocument,
} from '../../database/schemas/webhook-subscription.schema';
import {
  CatalogProduct,
  CatalogProductDocument,
} from '../../database/schemas/catalog-product.schema';
import { StoreListing, StoreListingDocument } from '../../database/schemas/store-listing.schema';
import { Bundle, BundleDocument } from '../../database/schemas/bundle.schema';
import { Unit, UnitDocument } from '../../database/schemas/unit.schema';
import { AttributeSet, AttributeSetDocument } from '../../database/schemas/attribute-set.schema';
import {
  InvoiceCounter,
  InvoiceCounterDocument,
} from '../../database/schemas/invoice-counter.schema';
import {
  LoyaltyTransaction,
  LoyaltyTransactionDocument,
} from '../../database/schemas/loyalty-transaction.schema';
import { PriceHistory, PriceHistoryDocument } from '../../database/schemas/price-history.schema';
import { ImportJob, ImportJobDocument } from '../../database/schemas/import-job.schema';
import { AutomationRun, AutomationRunDocument } from '../../database/schemas/automation-run.schema';
import { RefreshToken, RefreshTokenDocument } from '../../database/schemas/refresh-token.schema';
import {
  Setting,
  SettingDocument,
  Tax,
  TaxDocument,
  Discount,
  DiscountDocument,
  PricingRule,
  PricingRuleDocument,
  PaymentMethod,
  PaymentMethodDocument,
  ApiKey,
  ApiKeyDocument,
} from '../../database/schemas/settings.schema';
import { Account, AccountDocument } from '../finance/schemas/account.schema';
import { JournalEntry, JournalEntryDocument } from '../finance/schemas/journal-entry.schema';
import {
  FinancialPeriod,
  FinancialPeriodDocument,
} from '../finance/schemas/financial-period.schema';
import { Department, DepartmentDocument } from '../hrm/schemas/department.schema';
import { Employee, EmployeeDocument } from '../hrm/schemas/employee.schema';
import { Attendance, AttendanceDocument } from '../hrm/schemas/attendance.schema';
import { LeaveRequest, LeaveRequestDocument } from '../hrm/schemas/leave-request.schema';
import { PayrollRun, PayrollRunDocument } from '../hrm/schemas/payroll-run.schema';
import { isPlatformRole, PLATFORM_ROLES } from '../../common/constants/platform-roles';
import {
  buildTenantPlanUpdate,
  getPlanTiersForApi,
  normalizePlanTier,
  resolveTenantFeatures,
} from '../../common/constants/plan-features';
import { isTrialWindowActive } from '../../common/utils/subscription-access.util';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AdminPlanListItem } from './types/admin-plan.types';
import { ContactSubmission, ContactSubmissionDocument } from '../contact/contact.schema';
import { DEFAULT_SUBSCRIPTION_PLANS } from './default-plans';
import { PlatformAuditService } from './platform-audit.service';
import { escapeRegex } from '../../common/utils/regex.util';
import { clampLimit, clampPage } from '../../common/utils/pagination.util';
import { assertValidObjectId, assertValidObjectIds } from '../../common/utils/mongo-id.util';
import { CreatePlanDto } from './dto/create-plan.dto';
import { normalizeCurrencyCode } from '../../common/utils/currency.util';

export interface PlatformActor {
  sub: string;
  email: string;
  role: string;
  effectivePermissions?: string[];
}

type TenantDeleteOptions = {
  confirmation?: string;
  reason?: string;
  skipConfirmation?: boolean;
};

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(BillingInvoice.name) private billingInvoiceModel: Model<BillingInvoiceDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(ContactSubmission.name) private contactModel: Model<ContactSubmissionDocument>,
    // ── Tenant cascade models (deleteTenant) ──
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name) private productVariantModel: Model<ProductVariantDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Brand.name) private brandModel: Model<BrandDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerGroup.name) private customerGroupModel: Model<CustomerGroupDocument>,
    @InjectModel(SaleOrder.name) private saleOrderModel: Model<SaleOrderDocument>,
    @InjectModel(HeldOrder.name) private heldOrderModel: Model<HeldOrderDocument>,
    @InjectModel(Invite.name) private inviteModel: Model<InviteDocument>,
    @InjectModel(Warehouse.name) private warehouseModel: Model<WarehouseDocument>,
    @InjectModel(Stock.name) private stockModel: Model<StockDocument>,
    @InjectModel(StockMovement.name) private stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(StockAdjustment.name) private stockAdjustmentModel: Model<StockAdjustmentDocument>,
    @InjectModel(Transfer.name) private transferModel: Model<TransferDocument>,
    @InjectModel(Batch.name) private batchModel: Model<BatchDocument>,
    @InjectModel(CycleCount.name) private cycleCountModel: Model<CycleCountDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(PurchaseOrder.name) private purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(PurchaseReturn.name) private purchaseReturnModel: Model<PurchaseReturnDocument>,
    @InjectModel(GoodsReceivedNote.name) private grnModel: Model<GoodsReceivedNoteDocument>,
    @InjectModel(SupplierInvoice.name) private supplierInvoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(PosSettings.name) private posSettingsModel: Model<PosSettingsDocument>,
    @InjectModel(PosShift.name) private posShiftModel: Model<PosShiftDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(WebhookSubscription.name)
    private webhookSubscriptionModel: Model<WebhookSubscriptionDocument>,
    @InjectModel(CatalogProduct.name) private catalogProductModel: Model<CatalogProductDocument>,
    @InjectModel(StoreListing.name) private storeListingModel: Model<StoreListingDocument>,
    @InjectModel(Bundle.name) private bundleModel: Model<BundleDocument>,
    @InjectModel(Unit.name) private unitModel: Model<UnitDocument>,
    @InjectModel(AttributeSet.name) private attributeSetModel: Model<AttributeSetDocument>,
    @InjectModel(InvoiceCounter.name) private invoiceCounterModel: Model<InvoiceCounterDocument>,
    @InjectModel(LoyaltyTransaction.name)
    private loyaltyTransactionModel: Model<LoyaltyTransactionDocument>,
    @InjectModel(PriceHistory.name) private priceHistoryModel: Model<PriceHistoryDocument>,
    @InjectModel(ImportJob.name) private importJobModel: Model<ImportJobDocument>,
    @InjectModel(AutomationRun.name) private automationRunModel: Model<AutomationRunDocument>,
    @InjectModel(RefreshToken.name) private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    @InjectModel(Tax.name) private taxModel: Model<TaxDocument>,
    @InjectModel(Discount.name) private discountModel: Model<DiscountDocument>,
    @InjectModel(PricingRule.name) private pricingRuleModel: Model<PricingRuleDocument>,
    @InjectModel(PaymentMethod.name) private paymentMethodModel: Model<PaymentMethodDocument>,
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
    @InjectModel(Account.name) private accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name) private journalEntryModel: Model<JournalEntryDocument>,
    @InjectModel(FinancialPeriod.name) private financialPeriodModel: Model<FinancialPeriodDocument>,
    @InjectModel(Department.name) private departmentModel: Model<DepartmentDocument>,
    @InjectModel(Employee.name) private employeeModel: Model<EmployeeDocument>,
    @InjectModel(Attendance.name) private attendanceModel: Model<AttendanceDocument>,
    @InjectModel(LeaveRequest.name) private leaveRequestModel: Model<LeaveRequestDocument>,
    @InjectModel(PayrollRun.name) private payrollRunModel: Model<PayrollRunDocument>,
    private jwtService: JwtService,
    private platformAudit: PlatformAuditService,
  ) {}

  private async audit(
    actor: PlatformActor | undefined,
    action: string,
    entity: string,
    entityId: string,
    summary: string,
    metadata?: Record<string, unknown>,
  ) {
    if (!actor?.sub) return;
    await this.platformAudit.log({
      actorId: actor.sub,
      actorEmail: actor.email,
      actorRole: actor.role,
      action,
      entity,
      entityId,
      summary,
      metadata,
    });
  }

  private async getTenantUserForAdmin(userId: string) {
    assertValidObjectId(userId, 'user ID');
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.tenantId || isPlatformRole(user.role)) {
      throw new ForbiddenException(
        'Cannot modify platform operator accounts from tenant user admin',
      );
    }
    return user;
  }

  // ── Stats ──

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      trialTenants,
      activeSubscriptions,
      totalUsers,
      totalStores,
      monthlyRevenue,
      tenantsThisMonth,
      tenantsLastMonth,
      usersThisMonth,
      usersLastMonth,
      recentTenants,
      recentUsers,
      openSupportTickets,
      totalSupportTickets,
      overdueSubscriptions,
    ] = await Promise.all([
      this.tenantModel.countDocuments(),
      this.countActiveTenants(),
      this.countSuspendedTenants(),
      this.tenantModel.countDocuments({ plan: 'trial' }),
      this.subscriptionModel.countDocuments({ status: { $in: ['active', 'trial'] } }),
      this.userModel.countDocuments({ isActive: true }),
      this.storeModel.countDocuments(),
      this.getMonthlyRevenue(),
      this.tenantModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.tenantModel.countDocuments({
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.userModel.countDocuments({
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
      this.tenantModel
        .find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name plan isActive createdAt')
        .lean(),
      this.userModel
        .find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('fullName email role createdAt')
        .lean(),
      this.contactModel.countDocuments({ status: 'new' }),
      this.contactModel.countDocuments({ status: { $in: ['new', 'read'] } }),
      this.subscriptionModel.countDocuments({ status: 'overdue' }),
    ]);

    const planBreakdown = await this.tenantModel.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 } } },
    ]);

    const roleBreakdown = await this.userModel.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);

    return {
      totalTenants,
      activeTenants,
      suspendedTenants,
      trialTenants,
      activeSubscriptions,
      totalUsers,
      totalStores,
      monthlyRevenue,
      tenantsThisMonth,
      tenantsLastMonth,
      usersThisMonth,
      usersLastMonth,
      planBreakdown: planBreakdown.reduce(
        (acc, p) => ({ ...acc, [p._id || 'unknown']: p.count }),
        {},
      ),
      roleBreakdown: roleBreakdown.reduce(
        (acc, r) => ({ ...acc, [r._id || 'unknown']: r.count }),
        {},
      ),
      recentTenants,
      recentUsers,
      openSupportTickets,
      totalSupportTickets,
      overdueSubscriptions,
    };
  }

  /** Tenants with isActive=false or a suspended subscription (billing automation may not flip isActive). */
  private async countSuspendedTenants(): Promise<number> {
    const agg = await this.tenantModel.aggregate<{ total: number }>([
      {
        $lookup: {
          from: 'subscriptions',
          localField: '_id',
          foreignField: 'tenantId',
          as: 'subs',
        },
      },
      {
        $match: {
          $or: [{ isActive: false }, { 'subs.status': 'suspended' }],
        },
      },
      { $count: 'total' },
    ]);
    return agg[0]?.total ?? 0;
  }

  private async countActiveTenants(): Promise<number> {
    const agg = await this.tenantModel.aggregate<{ total: number }>([
      {
        $lookup: {
          from: 'subscriptions',
          localField: '_id',
          foreignField: 'tenantId',
          as: 'subs',
        },
      },
      {
        $match: {
          isActive: true,
          'subs.status': { $nin: ['suspended', 'cancelled'] },
        },
      },
      { $count: 'total' },
    ]);
    return agg[0]?.total ?? 0;
  }

  private async getMonthlyRevenue(): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = await this.billingInvoiceModel.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result[0]?.total || 0;
  }

  // ── Tenant CRUD ──

  async getTenants(page = 1, limit = 15, search?: string, plan?: string, status?: string) {
    const safePage = clampPage(page);
    const safeLimit = clampLimit(limit, 15);
    const query: any = {};
    if (search) {
      const term = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { subdomain: { $regex: term, $options: 'i' } },
      ];
    }
    if (plan) query.plan = plan;
    if (status === 'active') {
      const inactiveSubscriptionIds = await this.subscriptionModel
        .find({ status: { $in: ['suspended', 'cancelled'] } })
        .distinct('tenantId');
      query.isActive = true;
      query._id = { $nin: inactiveSubscriptionIds };
    } else if (status === 'suspended') {
      const subSuspendedIds = await this.subscriptionModel
        .find({ status: 'suspended' })
        .distinct('tenantId');
      const suspendedOr = [{ isActive: false }, { _id: { $in: subSuspendedIds } }];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: suspendedOr }];
        delete query.$or;
      } else {
        query.$or = suspendedOr;
      }
    }

    const [data, total] = await Promise.all([
      this.tenantModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      this.tenantModel.countDocuments(query),
    ]);

    const tenantIds = data.map((t) => t._id);
    const [owners, subscriptions, storeCounts, userCounts] = await Promise.all([
      this.userModel
        .find({ tenantId: { $in: tenantIds }, role: 'owner' })
        .select('email tenantId')
        .lean(),
      this.subscriptionModel
        .find({ tenantId: { $in: tenantIds } })
        .select('tenantId planName status')
        .lean(),
      this.storeModel.aggregate([
        { $match: { tenantId: { $in: tenantIds } } },
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      ]),
      this.userModel.aggregate([
        { $match: { tenantId: { $in: tenantIds } } },
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      ]),
    ]);

    const ownerMap = new Map(owners.map((o) => [o.tenantId!.toString(), o.email])); // FIXED: non-null assertion
    const subMap = new Map(subscriptions.map((s) => [s.tenantId.toString(), s]));
    const storeCountMap = new Map(storeCounts.map((r: any) => [r._id.toString(), r.count]));
    const userCountMap = new Map(userCounts.map((r: any) => [r._id.toString(), r.count]));

    const tenants = data.map((t) => {
      const sub = subMap.get(t._id.toString());
      const plan = normalizePlanTier(t.plan);
      const hasActiveTrial = sub && isTrialWindowActive(sub as any, t as any);
      const status =
        !t.isActive || sub?.status === 'suspended' || sub?.status === 'cancelled'
          ? 'suspended'
          : hasActiveTrial
            ? 'trial'
            : sub?.status || 'active';
      return {
        _id: t._id,
        name: t.name,
        subdomain: t.subdomain,
        email: ownerMap.get(t._id.toString()) || '',
        plan: plan === 'trial' ? 'trial' : sub?.planName || plan,
        status,
        isActive: t.isActive !== false,
        subscriptionStatus: sub?.status || null,
        featureAccess: (t as any).featureAccess || [],
        storeCount: storeCountMap.get(t._id.toString()) || 0,
        userCount: userCountMap.get(t._id.toString()) || 0,
        createdAt: (t as any).createdAt,
      };
    });

    return { tenants, total, pages: Math.ceil(total / safeLimit), page: safePage };
  }

  async getTenant(tenantId: string): Promise<{
    tenant: any;
    owner: any;
    subscription: any;
    recentInvoices: any[];
    stores: any[];
  }> {
    assertValidObjectId(tenantId, 'tenant ID');
    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const [owner, storeCount, userCount, subscription, recentInvoices, stores] = await Promise.all([
      this.userModel
        .findOne({ tenantId, role: 'owner' })
        .select('_id email fullName role tenantId isActive emailVerified createdAt')
        .lean(),
      this.storeModel.countDocuments({ tenantId }),
      this.userModel.countDocuments({ tenantId }),
      this.subscriptionModel.findOne({ tenantId }).lean(),
      this.billingInvoiceModel.find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
      this.storeModel.find({ tenantId }).select('name code isActive createdAt').lean(),
    ]);

    return {
      tenant: {
        ...tenant,
        storeCount,
        userCount,
      },
      owner: owner || null,
      subscription: subscription || null,
      recentInvoices,
      stores,
    };
  }

  async createTenant(
    dto: {
      name: string;
      subdomain: string;
      ownerName: string;
      ownerEmail: string;
      ownerPassword: string;
      plan?: string;
    },
    actor?: PlatformActor,
  ) {
    const subdomain = dto.subdomain.toLowerCase().trim();
    const ownerEmail = dto.ownerEmail.toLowerCase().trim();

    const [existingTenant, existingUser] = await Promise.all([
      this.tenantModel.findOne({ subdomain }).lean(),
      this.userModel.findOne({ email: ownerEmail }).lean(),
    ]);
    if (existingTenant) throw new BadRequestException('Tenant subdomain already exists');
    if (existingUser) throw new BadRequestException('User email already exists');

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(dto.ownerPassword, 12);

    const planFields = buildTenantPlanUpdate(dto.plan || 'basic');

    const tenant = await this.tenantModel.create({
      name: dto.name,
      subdomain,
      isActive: true,
      baseCurrency: normalizeCurrencyCode('USD'),
      baseCurrencySource: 'legacy',
      ...planFields,
    });

    await this.roleModel.insertMany(
      DEFAULT_ROLES_DATA.map((r) => ({
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        isSystem: r.isSystem,
        isAssignable: r.isAssignable,
        level: r.level,
        tenantId: tenant._id,
      })),
    );

    const mainStore = await this.storeModel.create({
      name: 'Main Store',
      code: 'MAIN',
      address: '',
      currency: normalizeCurrencyCode('USD'),
      tenantId: tenant._id,
      isActive: true,
    });

    const owner = await this.userModel.create({
      tenantId: tenant._id,
      role: 'owner',
      permissions: [],
      storeAccess: [mainStore._id],
      emailVerified: true,
      isActive: true,
      email: ownerEmail,
      passwordHash,
      fullName: dto.ownerName,
    });

    await this.audit(
      actor,
      'create',
      'tenant',
      tenant._id.toString(),
      `Created tenant ${tenant.name} (${subdomain})`,
      { ownerEmail },
    );

    return {
      tenant: tenant.toObject(),
      owner: {
        _id: owner._id,
        email: owner.email,
        fullName: owner.fullName,
        role: owner.role,
        tenantId: owner.tenantId,
        isActive: owner.isActive,
        emailVerified: owner.emailVerified,
        createdAt: (owner as any).createdAt,
      },
    };
  }

  async updateTenant(
    tenantId: string,
    dto: {
      name?: string;
      subdomain?: string;
      plan?: string;
      isActive?: boolean;
      maxUsers?: number;
      maxStores?: number;
      maxStorageMB?: number;
      subscriptionEndDate?: Date;
      settings?: Record<string, unknown>;
      featureOverrides?: Record<string, boolean>;
    },
    actor?: PlatformActor,
  ) {
    assertValidObjectId(tenantId, 'tenant ID');
    const tenant = await this.tenantModel.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (dto.subdomain) {
      const subdomain = dto.subdomain.toLowerCase().trim();
      const conflict = await this.tenantModel.findOne({ subdomain, _id: { $ne: tenantId } }).lean();
      if (conflict) throw new BadRequestException('Tenant subdomain already exists');
      tenant.subdomain = subdomain;
    }
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.isActive !== undefined) tenant.isActive = dto.isActive;
    if (dto.maxUsers !== undefined) tenant.maxUsers = dto.maxUsers;
    if (dto.maxStores !== undefined) tenant.maxStores = dto.maxStores;
    if (dto.maxStorageMB !== undefined) tenant.maxStorageMB = dto.maxStorageMB;
    if (dto.subscriptionEndDate !== undefined) tenant.subscriptionEndDate = dto.subscriptionEndDate;
    if (dto.settings !== undefined) {
      tenant.settings = { ...(tenant.settings || {}), ...dto.settings };
    }
    if (dto.featureOverrides !== undefined) tenant.featureOverrides = dto.featureOverrides;

    if (dto.plan !== undefined) {
      const planFields = buildTenantPlanUpdate(dto.plan);
      Object.assign(tenant, planFields);
      tenant.isActive = true;
    }

    await tenant.save();

    if (dto.plan !== undefined) {
      await this.syncSubscriptionAfterAdminPlanChange(tenant._id, normalizePlanTier(dto.plan));
    }

    await this.audit(actor, 'update', 'tenant', tenantId, `Updated tenant ${tenant.name}`, {
      changedFields: Object.keys(dto),
    });
    return tenant.toObject();
  }

  /** Plans for marketing site (no auth). */
  async ensureDefaultPlans() {
    const count = await this.planModel.countDocuments();
    if (count > 0) return;
    await this.planModel.insertMany(DEFAULT_SUBSCRIPTION_PLANS);
  }

  /** Plans for marketing site (no auth). */
  async getPublicPlans() {
    await this.ensureDefaultPlans();
    const plans = await this.planModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, price: 1 })
      .lean();

    const supportByTier: Record<string, string> = {
      basic: 'Email support',
      pro: 'Priority support',
      enterprise: 'Dedicated manager',
    };

    return plans.map((p, index, arr) => {
      const name = p.name;
      const tier = name.toLowerCase();
      const priceNum = Number(p.price);
      const isEnterprise = priceNum <= 0 || /enterprise|custom/i.test(name);
      const mid = Math.floor(arr.length / 2);
      const users = (p as any).maxUsers ?? p.userLimit ?? 0;
      const stores = (p as any).maxStores ?? p.storeLimit ?? 0;
      const storageMb = p.storageLimitMB ?? 0;

      return {
        id: p._id.toString(),
        name,
        price: isEnterprise ? 'Custom' : `$${priceNum}`,
        priceValue: isEnterprise ? null : priceNum,
        period: isEnterprise ? '' : p.period === 'yearly' ? '/year' : '/month',
        description: p.description || `The ${name} plan for your retail business.`,
        features: Array.isArray(p.features) ? p.features : [],
        highlighted: arr.length > 1 ? index === mid : index === 0,
        cta: isEnterprise ? 'Contact Sales' : 'Start Free Trial',
        badge: isEnterprise
          ? 'Scale'
          : tier === 'pro'
            ? 'Most Popular'
            : tier === 'basic'
              ? 'Best to start'
              : null,
        supportLevel: supportByTier[tier] || 'Standard support',
        limits: {
          users: users || 'Unlimited',
          stores: stores || 'Unlimited',
          storageMB: storageMb || null,
        },
        maxUsers: users,
        maxStores: stores,
        storageLimitMB: storageMb,
      };
    });
  }

  async suspendTenant(tenantId: string, actor?: PlatformActor) {
    assertValidObjectId(tenantId, 'tenant ID');
    const tenant = await this.tenantModel.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');

    tenant.isActive = false;
    await tenant.save();

    await this.subscriptionModel.updateOne({ tenantId }, { status: 'suspended' });
    const userIds = await this.userModel.find({ tenantId }).distinct('_id');
    await Promise.all([
      this.userModel.updateMany(
        { tenantId },
        { $set: { isActive: false }, $inc: { tokenVersion: 1 } },
      ),
      this.refreshTokenModel.deleteMany({ userId: { $in: userIds } }),
    ]);

    await this.audit(actor, 'suspend', 'tenant', tenantId, `Suspended tenant ${tenant.name}`);
    return { message: 'Tenant suspended' };
  }

  async activateTenant(tenantId: string, actor?: PlatformActor) {
    assertValidObjectId(tenantId, 'tenant ID');
    const tenant = await this.tenantModel.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');

    tenant.isActive = true;
    await tenant.save();

    await this.subscriptionModel.updateOne({ tenantId }, { status: 'active' });
    // Tenant activation should restore owner/admin access without reviving every manually disabled staff user.
    await this.userModel.updateMany(
      { tenantId, role: { $in: ['owner', 'admin'] } },
      { $set: { isActive: true } },
    );

    await this.audit(actor, 'activate', 'tenant', tenantId, `Activated tenant ${tenant.name}`);
    return { message: 'Tenant activated' };
  }

  /**
   * Hard-delete a tenant and all tenant-scoped data across modules.
   * Child collections are removed in parallel; the tenant document is deleted last.
   */
  async deleteTenant(tenantId: string, actor?: PlatformActor, options: TenantDeleteOptions = {}) {
    assertValidObjectId(tenantId, 'tenant ID');
    const tenant = await this.tenantModel.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');
    const tenantName = tenant.name;

    if (!options.skipConfirmation && options.confirmation !== tenantName) {
      throw new BadRequestException('Tenant deletion requires typing the exact tenant name');
    }

    const tid = new Types.ObjectId(tenantId);
    const tenantFilter = { tenantId: tid };

    const userIds = await this.userModel.find(tenantFilter).distinct('_id');

    await Promise.all([
      // Auth
      this.refreshTokenModel.deleteMany({ userId: { $in: userIds } }),

      // POS & sales
      this.saleOrderModel.deleteMany(tenantFilter),
      this.heldOrderModel.deleteMany(tenantFilter),
      this.posShiftModel.deleteMany(tenantFilter),
      this.posSettingsModel.deleteMany(tenantFilter),
      this.loyaltyTransactionModel.deleteMany(tenantFilter),
      this.invoiceCounterModel.deleteMany(tenantFilter),

      // Inventory
      this.stockMovementModel.deleteMany(tenantFilter),
      this.stockAdjustmentModel.deleteMany(tenantFilter),
      this.transferModel.deleteMany(tenantFilter),
      this.cycleCountModel.deleteMany(tenantFilter),
      this.batchModel.deleteMany(tenantFilter),
      this.stockModel.deleteMany(tenantFilter),
      this.warehouseModel.deleteMany(tenantFilter),

      // Purchases
      this.purchaseOrderModel.deleteMany(tenantFilter),
      this.purchaseReturnModel.deleteMany(tenantFilter),
      this.grnModel.deleteMany(tenantFilter),
      this.supplierInvoiceModel.deleteMany(tenantFilter),
      this.supplierModel.deleteMany(tenantFilter),

      // Products & catalog
      this.productVariantModel.deleteMany(tenantFilter),
      this.productModel.deleteMany(tenantFilter),
      this.storeListingModel.deleteMany(tenantFilter),
      this.catalogProductModel.deleteMany(tenantFilter),
      this.categoryModel.deleteMany(tenantFilter),
      this.brandModel.deleteMany(tenantFilter),
      this.unitModel.deleteMany(tenantFilter),
      this.attributeSetModel.deleteMany(tenantFilter),
      this.bundleModel.deleteMany(tenantFilter),
      this.priceHistoryModel.deleteMany(tenantFilter),

      // Customers
      this.customerModel.deleteMany(tenantFilter),
      this.customerGroupModel.deleteMany(tenantFilter),

      // Finance
      this.journalEntryModel.deleteMany(tenantFilter),
      this.accountModel.deleteMany(tenantFilter),
      this.financialPeriodModel.deleteMany(tenantFilter),
      this.expenseModel.deleteMany(tenantFilter),

      // HRM
      this.payrollRunModel.deleteMany(tenantFilter),
      this.leaveRequestModel.deleteMany(tenantFilter),
      this.attendanceModel.deleteMany(tenantFilter),
      this.employeeModel.deleteMany(tenantFilter),
      this.departmentModel.deleteMany(tenantFilter),

      // Settings & platform hooks
      this.settingModel.deleteMany(tenantFilter),
      this.taxModel.deleteMany(tenantFilter),
      this.discountModel.deleteMany(tenantFilter),
      this.pricingRuleModel.deleteMany(tenantFilter),
      this.paymentMethodModel.deleteMany(tenantFilter),
      this.apiKeyModel.deleteMany(tenantFilter),
      this.webhookSubscriptionModel.deleteMany(tenantFilter),
      this.notificationModel.deleteMany(tenantFilter),
      this.auditLogModel.deleteMany(tenantFilter),
      this.importJobModel.deleteMany(tenantFilter),
      this.automationRunModel.deleteMany(tenantFilter),

      // Access control & billing
      this.inviteModel.deleteMany(tenantFilter),
      this.roleModel.deleteMany(tenantFilter),
      this.userModel.deleteMany(tenantFilter),
      this.storeModel.deleteMany(tenantFilter),
      this.subscriptionModel.deleteMany(tenantFilter),
      this.billingInvoiceModel.deleteMany(tenantFilter),
    ]);

    await this.tenantModel.findByIdAndDelete(tenantId);

    await this.audit(actor, 'delete', 'tenant', tenantId, `Deleted tenant ${tenantName}`, {
      reason: options.reason || 'No reason provided',
    });
    return { message: 'Tenant and all associated data deleted' };
  }

  async loginAsTenant(tenantId: string, actor?: PlatformActor) {
    assertValidObjectId(tenantId, 'tenant ID');
    const owner = await this.userModel.findOne({ tenantId, role: 'owner' });
    if (!owner) throw new NotFoundException('Tenant owner not found');

    const tenant = await this.tenantModel
      .findById(tenantId)
      .lean<{ plan?: string; featureAccess?: string[] }>();
    const plan = tenant?.plan ?? 'basic';
    const featureAccess = resolveTenantFeatures(plan, tenant?.featureAccess);
    const roleDoc = await this.roleModel
      .findOne({ tenantId, name: owner.role })
      .lean<{ permissions: string[] }>();

    const rolePermissions =
      owner.role === 'owner'
        ? ['*']
        : (roleDoc?.permissions ??
          DEFAULT_ROLES_DATA.find((r) => r.name === owner.role)?.permissions ??
          []);

    const payload = {
      sub: owner._id.toString(),
      email: owner.email,
      role: owner.role,
      tenantId: owner.tenantId!.toString(),
      permissions: owner.permissions ?? [],
      effectivePermissions: [...new Set([...rolePermissions, ...(owner.permissions ?? [])])],
      plan,
      featureAccess,
      storeAccess: (owner.storeAccess ?? []).map((id) => id.toString()),
      tokenVersion: owner.tokenVersion ?? 0,
      impersonatedBy: actor?.sub,
      impersonatedByEmail: actor?.email,
      impersonated: true,
    };

    // Impersonation is intentionally short-lived because it grants tenant-owner context.
    const token = this.jwtService.sign(payload, { expiresIn: '15m' });

    await this.audit(
      actor,
      'impersonate',
      'tenant',
      tenantId,
      `Impersonated tenant owner ${owner.email}`,
      { tenantId, ownerId: owner._id.toString(), expiresInMinutes: 15 },
    );

    return {
      token,
      impersonation: {
        actorId: actor?.sub,
        actorEmail: actor?.email,
        expiresInMinutes: 15,
      },
      user: {
        id: owner._id,
        email: owner.email,
        role: owner.role,
        tenantId,
        plan,
        featureAccess: payload.featureAccess,
        effectivePermissions: payload.effectivePermissions,
      },
    };
  }

  getPlanTiers() {
    return getPlanTiersForApi();
  }

  /**
   * Keep subscription + account flags aligned when an admin assigns a paid plan.
   * Without this, subscription.status can stay trial/suspended while tenant.plan is enterprise.
   */
  private async syncSubscriptionAfterAdminPlanChange(
    tenantId: string | Types.ObjectId,
    tier: string,
  ): Promise<void> {
    const oid = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;
    const now = new Date();
    const renewalDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.tenantModel.findByIdAndUpdate(oid, { $set: { isActive: true } });
    // Do not mass-reactivate users here; manual deactivations must survive plan changes.

    const catalogPlan = await this.planModel
      .findOne({ name: new RegExp(`^${escapeRegex(tier)}$`, 'i'), isActive: true })
      .lean();

    const isPaidTier = tier !== 'trial';
    const subPayload: Record<string, unknown> = {
      planName: catalogPlan?.name || tier,
      ...(catalogPlan ? { planId: catalogPlan._id, price: catalogPlan.price } : {}),
      status: isPaidTier ? 'active' : 'trial',
      renewalDate,
      trialEndsAt: isPaidTier ? null : renewalDate,
      overdueSince: null,
      autoRenew: isPaidTier,
    };

    const existing = await this.subscriptionModel.findOne({ tenantId: oid }).lean();
    if (existing) {
      await this.subscriptionModel.updateOne({ tenantId: oid }, { $set: subPayload });
    } else {
      await this.subscriptionModel.create({
        tenantId: oid,
        planId: catalogPlan?._id || new Types.ObjectId(),
        planName: catalogPlan?.name || tier,
        price: catalogPlan?.price ?? 0,
        billingCycle: 'monthly',
        startDate: now,
        ...subPayload,
      });
    }
  }

  async setTenantPlan(tenantId: string, plan: string, actor?: PlatformActor) {
    assertValidObjectId(tenantId, 'tenant ID');
    const tier = normalizePlanTier(plan);
    const planFields = buildTenantPlanUpdate(tier);
    const tenant = await this.tenantModel.findByIdAndUpdate(
      tenantId,
      { $set: { ...planFields, isActive: true } },
      { new: true },
    );
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.syncSubscriptionAfterAdminPlanChange(tenant._id, tier);

    await this.audit(actor, 'plan_change', 'tenant', tenantId, `Set tenant plan to ${tier}`);
    return tenant;
  }

  /** @deprecated Use setTenantPlan — kept for backwards compatibility */
  async setFeatureAccess(tenantId: string, featureAccess: string[]) {
    if (featureAccess.includes('*')) {
      return this.setTenantPlan(tenantId, 'enterprise');
    }
    return this.setTenantPlan(tenantId, 'basic');
  }

  async bulkSetTenantPlan(ids: string[], plan: string, actor?: PlatformActor) {
    assertValidObjectIds(ids, 'tenant IDs');
    const tier = normalizePlanTier(plan);
    const planFields = buildTenantPlanUpdate(tier);
    const matchedTenants = await this.tenantModel
      .find({ _id: { $in: ids } })
      .select('_id')
      .lean();
    const matchedIds = matchedTenants.map((t) => t._id);
    const tenantUpdate = await this.tenantModel.updateMany(
      { _id: { $in: ids } },
      { $set: { ...planFields, isActive: true } },
    );
    await Promise.all(matchedIds.map((id) => this.syncSubscriptionAfterAdminPlanChange(id, tier)));
    await this.audit(
      actor,
      'plan_change_bulk',
      'tenant',
      ids.join(','),
      `Bulk set plan to ${tier}`,
      { count: ids.length },
    );
    return { count: (tenantUpdate as any).matchedCount ?? (tenantUpdate as any).n ?? 0 };
  }

  /** @deprecated Use bulkSetTenantPlan */
  async bulkSetFeatureAccess(ids: string[], featureAccess: string[]) {
    const plan = featureAccess.includes('*') ? 'enterprise' : 'basic';
    return this.bulkSetTenantPlan(ids, plan);
  }

  async bulkSuspendTenants(ids: string[], actor?: PlatformActor) {
    assertValidObjectIds(ids, 'tenant IDs');
    const tenantUpdate = await this.tenantModel.updateMany(
      { _id: { $in: ids } },
      { $set: { isActive: false } },
    );
    const userIds = await this.userModel.find({ tenantId: { $in: ids } }).distinct('_id');
    await Promise.all([
      this.subscriptionModel.updateMany(
        { tenantId: { $in: ids } },
        { $set: { status: 'suspended' } },
      ),
      this.userModel.updateMany(
        { tenantId: { $in: ids } },
        { $set: { isActive: false }, $inc: { tokenVersion: 1 } },
      ),
      this.refreshTokenModel.deleteMany({ userId: { $in: userIds } }),
    ]);
    await this.audit(
      actor,
      'suspend_bulk',
      'tenant',
      ids.join(','),
      `Bulk suspended ${ids.length} tenants`,
    );
    return { count: (tenantUpdate as any).matchedCount ?? (tenantUpdate as any).n ?? 0 };
  }

  async bulkActivateTenants(ids: string[], actor?: PlatformActor) {
    assertValidObjectIds(ids, 'tenant IDs');
    const tenantUpdate = await this.tenantModel.updateMany(
      { _id: { $in: ids } },
      { $set: { isActive: true } },
    );
    await this.subscriptionModel.updateMany(
      { tenantId: { $in: ids } },
      { $set: { status: 'active' } },
    );
    await this.userModel.updateMany(
      { tenantId: { $in: ids }, role: { $in: ['owner', 'admin'] } },
      { $set: { isActive: true } },
    );
    await this.audit(
      actor,
      'activate_bulk',
      'tenant',
      ids.join(','),
      `Bulk activated ${ids.length} tenants`,
    );
    return { count: (tenantUpdate as any).matchedCount ?? (tenantUpdate as any).n ?? 0 };
  }

  async bulkDeleteTenants(
    ids: string[],
    actor?: PlatformActor,
    options: Pick<TenantDeleteOptions, 'confirmation' | 'reason'> = {},
  ) {
    assertValidObjectIds(ids, 'tenant IDs');
    if (options.confirmation !== `DELETE ${ids.length}`) {
      throw new BadRequestException(
        `Bulk tenant deletion requires confirmation: DELETE ${ids.length}`,
      );
    }
    let count = 0;
    for (const tenantId of ids) {
      await this.deleteTenant(tenantId, actor, {
        reason: options.reason,
        skipConfirmation: true,
      });
      count += 1;
    }
    return { count };
  }

  // ── Plan CRUD ──

  async getPlans(): Promise<AdminPlanListItem[]> {
    await this.ensureDefaultPlans();
    const plans = await this.planModel.find().sort({ sortOrder: 1, price: 1 }).lean();
    return plans.map((p) => ({
      _id: String(p._id),
      name: p.name,
      price: p.price,
      period: p.period || 'monthly',
      description: p.description || '',
      features: Array.isArray(p.features) ? p.features : [],
      userLimit: p.userLimit ?? 0,
      storeLimit: p.storeLimit ?? 0,
      storageLimitMB: p.storageLimitMB ?? 0,
      isActive: p.isActive !== false,
      sortOrder: p.sortOrder ?? 0,
      maxUsers: (p as { maxUsers?: number }).maxUsers ?? p.userLimit ?? 0,
      maxStores: (p as { maxStores?: number }).maxStores ?? p.storeLimit ?? 0,
      createdAt: (p as { createdAt?: Date }).createdAt?.toISOString?.(),
      updatedAt: (p as { updatedAt?: Date }).updatedAt?.toISOString?.(),
    }));
  }

  private normalizePlanDto(dto: CreatePlanDto) {
    const payload: Record<string, unknown> = { ...dto };
    if (payload.maxUsers != null && payload.userLimit == null) {
      payload.userLimit = payload.maxUsers;
      delete payload.maxUsers;
    }
    if (payload.maxStores != null && payload.storeLimit == null) {
      payload.storeLimit = payload.maxStores;
      delete payload.maxStores;
    }
    return payload;
  }

  async createPlan(dto: CreatePlanDto, actor?: PlatformActor) {
    const existing = await this.planModel.findOne({ name: dto.name });
    if (existing) throw new BadRequestException('Plan name already exists');
    const plan = await this.planModel.create(this.normalizePlanDto(dto));
    await this.audit(actor, 'create', 'plan', plan._id.toString(), `Created plan ${plan.name}`);
    return plan;
  }

  async updatePlan(planId: string, dto: CreatePlanDto, actor?: PlatformActor) {
    assertValidObjectId(planId, 'plan ID');
    const plan = await this.planModel.findByIdAndUpdate(
      planId,
      { $set: this.normalizePlanDto(dto) },
      { new: true },
    );
    if (!plan) throw new NotFoundException('Plan not found');
    await this.audit(actor, 'update', 'plan', planId, `Updated plan ${plan.name}`);
    return plan;
  }

  async deletePlan(planId: string, actor?: PlatformActor) {
    assertValidObjectId(planId, 'plan ID');
    const inUse = await this.subscriptionModel.countDocuments({ planId });
    if (inUse > 0) {
      throw new BadRequestException(
        'Cannot delete a plan with active subscriptions. Deactivate it instead.',
      );
    }
    const plan = await this.planModel.findById(planId).lean();
    await this.planModel.findByIdAndDelete(planId);
    await this.audit(actor, 'delete', 'plan', planId, `Deleted plan ${plan?.name || planId}`);
    return { message: 'Plan deleted' };
  }

  // ── Global Users ──

  async getUsers(page: number, limit: number, search?: string, role?: string) {
    const safePage = clampPage(page);
    const safeLimit = clampLimit(limit, 20);
    const filter: any = { tenantId: { $ne: null } };
    if (search) {
      const term = escapeRegex(search.trim());
      filter.$or = [
        { email: { $regex: term, $options: 'i' } },
        { fullName: { $regex: term, $options: 'i' } },
      ];
    }
    if (role) filter.role = role;

    const total = await this.userModel.countDocuments(filter);
    const users = await this.userModel
      .find(filter)
      .populate('tenantId', 'name subdomain plan')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean();

    return {
      users: users.map((u) => {
        const tenant = u.tenantId as any;
        const lockUntil = u.lockUntil ? new Date(u.lockUntil) : null;
        const isLocked = !!(lockUntil && lockUntil.getTime() > Date.now());
        return {
          _id: u._id,
          email: u.email,
          fullName: u.fullName,
          role: u.role,
          isActive: u.isActive,
          tenant: tenant && typeof tenant === 'object' ? tenant : null,
          tenantName: tenant?.name || null,
          failedLoginAttempts: u.failedLoginAttempts ?? 0,
          lockUntil: u.lockUntil || null,
          isLocked,
          createdAt: (u as any).createdAt,
        };
      }),
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
    };
  }

  async setUserStatus(userId: string, isActive: boolean, actor?: PlatformActor) {
    const user = await this.getTenantUserForAdmin(userId);
    user.isActive = isActive;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    await this.refreshTokenModel.deleteMany({ userId: user._id });
    await this.audit(
      actor,
      isActive ? 'activate' : 'deactivate',
      'user',
      userId,
      `${isActive ? 'Activated' : 'Deactivated'} user ${user.email}`,
    );
    return {
      message: `User ${isActive ? 'activated' : 'deactivated'}`,
      user: { _id: user._id, isActive: user.isActive },
    };
  }

  async resetUserPassword(userId: string, actor?: PlatformActor) {
    const user = await this.getTenantUserForAdmin(userId);

    const crypto = await import('crypto');
    const bcrypt = await import('bcryptjs');
    const tempPassword = crypto.randomBytes(4).toString('hex') + 'A1!';
    user.passwordHash = await bcrypt.hash(tempPassword, 12);
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    await this.refreshTokenModel.deleteMany({ userId: user._id });

    await this.audit(actor, 'password_reset', 'user', userId, `Reset password for ${user.email}`);
    return { message: 'Password reset', tempPassword, email: user.email };
  }

  async unlockUser(userId: string, actor?: PlatformActor) {
    const user = await this.getTenantUserForAdmin(userId);
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    await this.audit(actor, 'unlock', 'user', userId, `Unlocked account ${user.email}`);
    return { message: 'Account unlocked', email: user.email };
  }

  async bulkSetUserStatus(ids: string[], isActive: boolean, actor?: PlatformActor) {
    assertValidObjectIds(ids, 'user IDs');
    const result = await this.userModel.updateMany(
      { _id: { $in: ids }, tenantId: { $ne: null }, role: { $nin: [...PLATFORM_ROLES, 'owner'] } },
      { $set: { isActive }, $inc: { tokenVersion: 1 } },
    );
    await this.refreshTokenModel.deleteMany({ userId: { $in: ids } });
    await this.audit(
      actor,
      isActive ? 'activate_bulk' : 'deactivate_bulk',
      'user',
      ids.join(','),
      `Bulk ${isActive ? 'activated' : 'deactivated'} tenant users`,
    );
    return { count: (result as any).modifiedCount ?? (result as any).nModified ?? 0 };
  }

  async bulkResetUserPasswords(ids: string[], actor?: PlatformActor) {
    assertValidObjectIds(ids, 'user IDs');
    const results: Array<{ userId: string; email: string; tempPassword: string }> = [];
    for (const id of ids) {
      try {
        const res = await this.resetUserPassword(id, actor);
        results.push({ userId: id, email: res.email, tempPassword: res.tempPassword });
      } catch {
        // skip invalid ids
      }
    }
    return { count: results.length, results };
  }

  async getActivityLogs(limit = 25) {
    const [recentTenants, recentUsers] = await Promise.all([
      this.tenantModel
        .find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('name plan isActive createdAt')
        .lean(),
      this.userModel
        .find({ role: { $ne: 'super_admin' } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('tenantId', 'name')
        .select('fullName email role isActive createdAt tenantId')
        .lean(),
    ]);

    const events: Array<{
      type: string;
      message: string;
      at: Date;
      meta?: Record<string, unknown>;
    }> = [];

    for (const t of recentTenants) {
      events.push({
        type: 'tenant',
        message: `Tenant registered: ${t.name} (${t.plan || 'trial'})`,
        at: (t as any).createdAt,
        meta: { tenantId: t._id, isActive: t.isActive },
      });
    }

    for (const u of recentUsers) {
      const tenantName =
        typeof u.tenantId === 'object' && u.tenantId !== null
          ? (u.tenantId as any).name
          : 'Unknown tenant';
      events.push({
        type: 'user',
        message: `User ${u.isActive !== false ? 'created' : 'inactive'}: ${u.fullName || u.email} (${u.role}) @ ${tenantName}`,
        at: (u as any).createdAt,
        meta: { userId: u._id, email: u.email, role: u.role },
      });
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { events: events.slice(0, limit) };
  }

  // ── Global search ──

  private actorHasPlatformPermission(
    actor: PlatformActor | undefined,
    permission: string,
  ): boolean {
    const perms = actor?.effectivePermissions ?? [];
    return perms.includes('*') || perms.includes(permission);
  }

  async globalSearch(q?: string, actor?: PlatformActor) {
    const term = (q || '').trim();
    if (term.length < 2) {
      return { tenants: [], users: [], tickets: [] };
    }

    const regex = { $regex: escapeRegex(term), $options: 'i' };
    const canViewTenants = this.actorHasPlatformPermission(actor, 'admin.tenants.view');
    const canViewUsers = this.actorHasPlatformPermission(actor, 'admin.users.view');
    const canViewSupport = this.actorHasPlatformPermission(actor, 'admin.support.view');

    const [tenants, users, tickets] = await Promise.all([
      canViewTenants
        ? this.tenantModel
            .find({ $or: [{ name: regex }, { subdomain: regex }] })
            .limit(8)
            .select('name subdomain plan isActive createdAt')
            .lean()
        : Promise.resolve([]),
      canViewUsers
        ? this.userModel
            .find({
              tenantId: { $ne: null },
              $or: [{ email: regex }, { fullName: regex }],
            })
            .limit(8)
            .select('email fullName role isActive tenantId')
            .populate('tenantId', 'name subdomain')
            .lean()
        : Promise.resolve([]),
      canViewSupport
        ? this.contactModel
            .find({
              $or: [{ email: regex }, { name: regex }, { subject: regex }, { company: regex }],
            })
            .limit(8)
            .select('name email subject status createdAt')
            .lean()
        : Promise.resolve([]),
    ]);

    return {
      tenants,
      users: users.map((u) => ({
        _id: u._id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        isActive: u.isActive,
        tenant: u.tenantId || null,
      })),
      tickets,
    };
  }

  // ── Billing oversight ──

  async getBillingOverview(page = 1, limit = 20) {
    const safePage = clampPage(page);
    const safeLimit = clampLimit(limit, 20);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [
      monthlyRevenue,
      failedInvoices,
      pendingInvoices,
      overdueSubscriptions,
      renewalsThisMonth,
      totalInvoices,
      invoices,
      recentFailed,
    ] = await Promise.all([
      this.getMonthlyRevenue(),
      this.billingInvoiceModel.countDocuments({ status: 'failed' }),
      this.billingInvoiceModel.countDocuments({ status: 'pending' }),
      this.subscriptionModel.countDocuments({ status: 'overdue' }),
      this.subscriptionModel.countDocuments({
        renewalDate: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $in: ['active', 'trial'] },
      }),
      this.billingInvoiceModel.countDocuments(),
      this.billingInvoiceModel
        .find()
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .populate('tenantId', 'name subdomain')
        .lean(),
      this.billingInvoiceModel
        .find({ status: 'failed' })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('tenantId', 'name subdomain')
        .lean(),
    ]);

    return {
      monthlyRevenue,
      failedInvoices,
      pendingInvoices,
      overdueSubscriptions,
      renewalsThisMonth,
      totalInvoices,
      invoices,
      recentFailed,
      page,
      pages: Math.ceil(totalInvoices / limit) || 1,
    };
  }

  // ── Platform team (SaaS operators) ──

  async getPlatformTeam() {
    const users = await this.userModel
      .find({ tenantId: null, role: { $in: PLATFORM_ROLES } })
      .select('fullName email role isActive createdAt jobTitle')
      .sort({ createdAt: -1 })
      .lean();
    return { users };
  }

  async createPlatformTeamMember(
    dto: {
      fullName: string;
      email: string;
      role: string;
      password?: string;
      jobTitle?: string;
    },
    actor?: PlatformActor,
  ) {
    if (!isPlatformRole(dto.role) || dto.role === 'super_admin') {
      throw new BadRequestException(
        `Invalid platform role. Choose one of: ${PLATFORM_ROLES.filter((r) => r !== 'super_admin').join(', ')}`,
      );
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ email, tenantId: null });
    if (existing) throw new BadRequestException('A platform user with this email already exists');

    const tempPassword = dto.password || crypto.randomBytes(6).toString('hex') + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await this.userModel.create({
      email,
      passwordHash,
      fullName: dto.fullName.trim(),
      role: dto.role,
      tenantId: null,
      permissions: [],
      isActive: true,
      emailVerified: true,
      jobTitle: dto.jobTitle || '',
    });

    await this.audit(
      actor,
      'create',
      'platform_user',
      user._id.toString(),
      `Created platform team member ${user.email} (${user.role})`,
      { role: user.role, jobTitle: user.jobTitle },
    );

    return {
      message: 'Platform team member created',
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      tempPassword: dto.password ? undefined : tempPassword,
    };
  }

  async updatePlatformTeamMember(
    userId: string,
    dto: { fullName?: string; role?: string; isActive?: boolean; jobTitle?: string },
    actor?: PlatformActor,
  ) {
    const user = await this.userModel.findOne({ _id: userId, tenantId: null });
    if (!user) throw new NotFoundException('Platform team member not found');
    const before = {
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      jobTitle: user.jobTitle,
    };
    if (user.role === 'super_admin' && dto.role && dto.role !== 'super_admin') {
      throw new BadRequestException('Cannot change role of super admin account');
    }
    if (dto.role) {
      if (!isPlatformRole(dto.role) || dto.role === 'super_admin') {
        throw new BadRequestException('Invalid platform role');
      }
      user.role = dto.role;
    }
    if (dto.fullName) user.fullName = dto.fullName.trim();
    if (dto.jobTitle !== undefined) user.jobTitle = dto.jobTitle;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    await this.refreshTokenModel.deleteMany({ userId: user._id });
    await this.audit(
      actor,
      'update',
      'platform_user',
      user._id.toString(),
      `Updated platform team member ${user.email}`,
      {
        before,
        after: {
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
          jobTitle: user.jobTitle,
        },
      },
    );
    return {
      message: 'Platform team member updated',
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        jobTitle: user.jobTitle,
      },
    };
  }
}
