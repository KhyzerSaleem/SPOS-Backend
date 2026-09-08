import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

// Common
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { validateEnv } from './config/env.validation';

// Guards that need to be in DI scope for app.useGlobalGuards() in main.ts
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { MaintenanceGuard } from './common/guards/maintenance.guard';
import {
  PlatformSettings,
  PlatformSettingsSchema,
} from './database/schemas/platform-settings.schema';
import { PlatformSettingsService } from './modules/admin/platform-settings.service';
import { Subscription, SubscriptionSchema } from './database/schemas/subscription.schema';
import { Tenant, TenantSchema } from './database/schemas/tenant.schema';
import { StoreGuardModule } from './common/modules/store-guard.module';
import { EmailModule } from './common/modules/email.module';
import { StockLedgerModule } from './common/modules/stock-ledger.module';
import { PlatformServicesModule } from './common/modules/platform-services.module';
import { CurrencyModule } from './common/modules/currency.module';
import { QueueModule } from './common/queue/queue.module';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PosModule } from './modules/pos/pos.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { BrandsModule } from './modules/brands/brands.module';
import { UnitsModule } from './modules/units/units.module';
import { AttributeSetsModule } from './modules/attribute-sets/attribute-sets.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { RolesModule } from './modules/roles/roles.module';
import { AdminModule } from './modules/admin/admin.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HrmModule } from './modules/hrm/hrm.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HealthModule } from './modules/health/health.module';
import { ContactModule } from './modules/contact/contact.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ApiModule } from './modules/api/api.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { MigrationModule } from './modules/migration/migration.module';
import { BlogModule } from './modules/blog/blog.module';

@Module({
  imports: [
    // -------------------------------------------------------------------------
    // Config — global so every module can inject ConfigService without importing
    // -------------------------------------------------------------------------
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),

    // -------------------------------------------------------------------------
    // Database
    // -------------------------------------------------------------------------
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('DATABASE_URL');
        if (!uri) {
          throw new Error('DATABASE_URL environment variable is not set.');
        }
        return {
          uri,
          serverSelectionTimeoutMS: 5_000, // fail fast if MongoDB is unreachable
          connectTimeoutMS: 10_000,
        };
      },
    }),

    // -------------------------------------------------------------------------
    // Rate limiting — global default: 100 req/min
    // Auth endpoints override this with stricter @Throttle() decorators
    // Health + Swagger are @Public() but still get throttled at the global rate
    // -------------------------------------------------------------------------
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    ScheduleModule.forRoot(),

    // -------------------------------------------------------------------------
    // Subscription schema — registered here so SubscriptionGuard (provided
    // below) can inject it. Guards registered via useGlobalGuards() in main.ts
    // need their dependencies available in the root DI context.
    // -------------------------------------------------------------------------
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
    ]),

    // QueueModule first — EmailModule's EmailQueueProcessor depends on QueueService.
    QueueModule,

    // StoreGuard is used on many controllers via @UseGuards(StoreGuard) — must be
    // registered globally so StoreModel is available in every module context.
    StoreGuardModule,
    StockLedgerModule,
    CurrencyModule,
    EmailModule,
    PlatformServicesModule,

    // -------------------------------------------------------------------------
    // Feature modules
    // -------------------------------------------------------------------------
    AuthModule,
    TenantModule,
    DashboardModule,
    PosModule,
    ProductsModule,
    CategoriesModule,
    BrandsModule,
    UnitsModule,
    AttributeSetsModule,
    InventoryModule,
    SalesModule,
    PurchasesModule,
    CustomersModule,
    SuppliersModule,
    ReportsModule,
    SettingsModule,
    RolesModule,
    AdminModule,
    BillingModule,
    NotificationsModule,
    HrmModule,
    FinanceModule,
    HealthModule,
    ContactModule,
    OnboardingModule,
    CatalogModule,
    ApiModule,
    SchedulerModule,
    MigrationModule,
    BlogModule,
  ],

  providers: [
    // -------------------------------------------------------------------------
    // GlobalExceptionFilter — registered via APP_FILTER so DI works inside it.
    // main.ts calls app.get(GlobalExceptionFilter) which resolves this instance.
    // -------------------------------------------------------------------------
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

    SubscriptionGuard,
    PlatformSettingsService,
    MaintenanceGuard,
  ],
})
export class AppModule {}
