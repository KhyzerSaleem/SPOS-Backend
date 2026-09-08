import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { PublicController } from './public.controller';
import { AdminService } from './admin.service';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Plan, PlanSchema } from '../../database/schemas/plan.schema';
import { Subscription, SubscriptionSchema } from '../../database/schemas/subscription.schema';
import {
  BillingInvoice,
  BillingInvoiceSchema,
} from '../../database/schemas/billing-invoice.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../../database/schemas/product-variant.schema';
import { Category, CategorySchema } from '../../database/schemas/category.schema';
import { Brand, BrandSchema } from '../../database/schemas/brand.schema';
import { Customer, CustomerSchema } from '../../database/schemas/customer.schema';
import { CustomerGroup, CustomerGroupSchema } from '../../database/schemas/customer-group.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import { HeldOrder, HeldOrderSchema } from '../../database/schemas/held-order.schema';
import { Invite, InviteSchema } from '../../database/schemas/invite.schema';
import { Warehouse, WarehouseSchema } from '../../database/schemas/warehouse.schema';
import { Stock, StockSchema } from '../../database/schemas/stock.schema';
import { StockMovement, StockMovementSchema } from '../../database/schemas/stock-movement.schema';
import {
  StockAdjustment,
  StockAdjustmentSchema,
} from '../../database/schemas/stock-adjustment.schema';
import { Transfer, TransferSchema } from '../../database/schemas/transfer.schema';
import { Batch, BatchSchema } from '../../database/schemas/batch.schema';
import { CycleCount, CycleCountSchema } from '../../database/schemas/cycle-count.schema';
import { Supplier, SupplierSchema } from '../../database/schemas/supplier.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../../database/schemas/purchase-order.schema';
import {
  PurchaseReturn,
  PurchaseReturnSchema,
} from '../../database/schemas/purchase-return.schema';
import {
  GoodsReceivedNote,
  GoodsReceivedNoteSchema,
} from '../../database/schemas/goods-received-note.schema';
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from '../../database/schemas/supplier-invoice.schema';
import { Expense, ExpenseSchema } from '../../database/schemas/expense.schema';
import { PosSettings, PosSettingsSchema } from '../../database/schemas/pos-settings.schema';
import { PosShift, PosShiftSchema } from '../../database/schemas/pos-shift.schema';
import { Notification, NotificationSchema } from '../../database/schemas/notification.schema';
import { AuditLog, AuditLogSchema } from '../../database/schemas/audit-log.schema';
import {
  WebhookSubscription,
  WebhookSubscriptionSchema,
} from '../../database/schemas/webhook-subscription.schema';
import {
  CatalogProduct,
  CatalogProductSchema,
} from '../../database/schemas/catalog-product.schema';
import { StoreListing, StoreListingSchema } from '../../database/schemas/store-listing.schema';
import { Bundle, BundleSchema } from '../../database/schemas/bundle.schema';
import { Unit, UnitSchema } from '../../database/schemas/unit.schema';
import { AttributeSet, AttributeSetSchema } from '../../database/schemas/attribute-set.schema';
import {
  InvoiceCounter,
  InvoiceCounterSchema,
} from '../../database/schemas/invoice-counter.schema';
import {
  LoyaltyTransaction,
  LoyaltyTransactionSchema,
} from '../../database/schemas/loyalty-transaction.schema';
import { PriceHistory, PriceHistorySchema } from '../../database/schemas/price-history.schema';
import { ImportJob, ImportJobSchema } from '../../database/schemas/import-job.schema';
import { AutomationRun, AutomationRunSchema } from '../../database/schemas/automation-run.schema';
import { RefreshToken, RefreshTokenSchema } from '../../database/schemas/refresh-token.schema';
import {
  Setting,
  SettingSchema,
  Tax,
  TaxSchema,
  Discount,
  DiscountSchema,
  PricingRule,
  PricingRuleSchema,
  PaymentMethod,
  PaymentMethodSchema,
  ApiKey,
  ApiKeySchema,
} from '../../database/schemas/settings.schema';
import { Account, AccountSchema } from '../finance/schemas/account.schema';
import { JournalEntry, JournalEntrySchema } from '../finance/schemas/journal-entry.schema';
import { FinancialPeriod, FinancialPeriodSchema } from '../finance/schemas/financial-period.schema';
import { Department, DepartmentSchema } from '../hrm/schemas/department.schema';
import { Employee, EmployeeSchema } from '../hrm/schemas/employee.schema';
import { Attendance, AttendanceSchema } from '../hrm/schemas/attendance.schema';
import { LeaveRequest, LeaveRequestSchema } from '../hrm/schemas/leave-request.schema';
import { PayrollRun, PayrollRunSchema } from '../hrm/schemas/payroll-run.schema';
import {
  PlatformSettings,
  PlatformSettingsSchema,
} from '../../database/schemas/platform-settings.schema';
import {
  PlatformAuditLog,
  PlatformAuditLogSchema,
} from '../../database/schemas/platform-audit-log.schema';
import { ContactSubmission, ContactSubmissionSchema } from '../contact/contact.schema';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformAuditService } from './platform-audit.service';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [
    SchedulerModule,
    MongooseModule.forFeature([
      // Core admin
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: BillingInvoice.name, schema: BillingInvoiceSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Role.name, schema: RoleSchema },
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
      { name: PlatformAuditLog.name, schema: PlatformAuditLogSchema },
      { name: ContactSubmission.name, schema: ContactSubmissionSchema },
      // Tenant cascade (deleteTenant)
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Brand.name, schema: BrandSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerGroup.name, schema: CustomerGroupSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: HeldOrder.name, schema: HeldOrderSchema },
      { name: Invite.name, schema: InviteSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Stock.name, schema: StockSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: StockAdjustment.name, schema: StockAdjustmentSchema },
      { name: Transfer.name, schema: TransferSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: CycleCount.name, schema: CycleCountSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: PurchaseReturn.name, schema: PurchaseReturnSchema },
      { name: GoodsReceivedNote.name, schema: GoodsReceivedNoteSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: PosSettings.name, schema: PosSettingsSchema },
      { name: PosShift.name, schema: PosShiftSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: WebhookSubscription.name, schema: WebhookSubscriptionSchema },
      { name: CatalogProduct.name, schema: CatalogProductSchema },
      { name: StoreListing.name, schema: StoreListingSchema },
      { name: Bundle.name, schema: BundleSchema },
      { name: Unit.name, schema: UnitSchema },
      { name: AttributeSet.name, schema: AttributeSetSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
      { name: ImportJob.name, schema: ImportJobSchema },
      { name: AutomationRun.name, schema: AutomationRunSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: Setting.name, schema: SettingSchema },
      { name: Tax.name, schema: TaxSchema },
      { name: Discount.name, schema: DiscountSchema },
      { name: PricingRule.name, schema: PricingRuleSchema },
      { name: PaymentMethod.name, schema: PaymentMethodSchema },
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: Account.name, schema: AccountSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: FinancialPeriod.name, schema: FinancialPeriodSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: PayrollRun.name, schema: PayrollRunSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '4h' },
      }),
    }),
  ],
  controllers: [AdminController, PublicController],
  providers: [AdminService, PlatformSettingsService, PlatformAuditService],
  exports: [AdminService, PlatformSettingsService, PlatformAuditService],
})
export class AdminModule {}
