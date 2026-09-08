import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Subscription, SubscriptionSchema } from '../../database/schemas/subscription.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import {
  PlatformSettings,
  PlatformSettingsSchema,
} from '../../database/schemas/platform-settings.schema';
import { AutomationRun, AutomationRunSchema } from '../../database/schemas/automation-run.schema';
import { Stock, StockSchema } from '../../database/schemas/stock.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { HeldOrder, HeldOrderSchema } from '../../database/schemas/held-order.schema';
import { Category, CategorySchema } from '../../database/schemas/category.schema';
import { Brand, BrandSchema } from '../../database/schemas/brand.schema';
import { Customer, CustomerSchema } from '../../database/schemas/customer.schema';
import { Supplier, SupplierSchema } from '../../database/schemas/supplier.schema';
import { Unit, UnitSchema } from '../../database/schemas/unit.schema';
import { Warehouse, WarehouseSchema } from '../../database/schemas/warehouse.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from '../../database/schemas/supplier-invoice.schema';
import { ExchangeRate, ExchangeRateSchema } from '../../database/schemas/exchange-rate.schema';
import { ContactSubmission, ContactSubmissionSchema } from '../contact/contact.schema';
import { EmailModule } from '../../common/modules/email.module';
import { PlanLimitsService } from '../../common/services/plan-limits.service';
import { TrialExpiryScheduler } from './trial-expiry.scheduler';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { AutomationRunnerService } from './automation-runner.service';
import { BillingLifecycleScheduler } from './billing-lifecycle.scheduler';
import { InventoryAlertsScheduler } from './inventory-alerts.scheduler';
import { OnboardingNudgeScheduler } from './onboarding-nudge.scheduler';
import { DataHygieneScheduler } from './data-hygiene.scheduler';
import { SupportSlaScheduler } from './support-sla.scheduler';
import { SalesSummaryScheduler } from './sales-summary.scheduler';
import { PlanLimitsScheduler } from './plan-limits.scheduler';
import { FinanceDueScheduler } from './finance-due.scheduler';
import { FxRateScheduler } from './fx-rate.scheduler';
import { AutomationStatusController } from './automation-status.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
      { name: AutomationRun.name, schema: AutomationRunSchema },
      { name: Stock.name, schema: StockSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Store.name, schema: StoreSchema },
      { name: HeldOrder.name, schema: HeldOrderSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Brand.name, schema: BrandSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Unit.name, schema: UnitSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: ExchangeRate.name, schema: ExchangeRateSchema },
      { name: ContactSubmission.name, schema: ContactSubmissionSchema },
    ]),
    EmailModule,
  ],
  controllers: [AutomationStatusController],
  providers: [
    AutomationRunnerService,
    PlanLimitsService,
    TrialExpiryScheduler,
    MaintenanceScheduler,
    BillingLifecycleScheduler,
    InventoryAlertsScheduler,
    OnboardingNudgeScheduler,
    DataHygieneScheduler,
    SupportSlaScheduler,
    SalesSummaryScheduler,
    PlanLimitsScheduler,
    FinanceDueScheduler,
    FxRateScheduler,
  ],
  exports: [AutomationRunnerService],
})
export class SchedulerModule {}
