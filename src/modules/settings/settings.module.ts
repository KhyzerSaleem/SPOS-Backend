import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Setting, SettingSchema } from '../../database/schemas/settings.schema';
import { Tax, TaxSchema } from '../../database/schemas/settings.schema';
import { Discount, DiscountSchema } from '../../database/schemas/settings.schema';
import { PricingRule, PricingRuleSchema } from '../../database/schemas/settings.schema';
import { PaymentMethod, PaymentMethodSchema } from '../../database/schemas/settings.schema';
import { ApiKey, ApiKeySchema } from '../../database/schemas/settings.schema';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import {
  InvoiceCounter,
  InvoiceCounterSchema,
} from '../../database/schemas/invoice-counter.schema';
import { ExchangeRate, ExchangeRateSchema } from '../../database/schemas/exchange-rate.schema';
import {
  WebhookSubscription,
  WebhookSubscriptionSchema,
} from '../../database/schemas/webhook-subscription.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TenantModule,
    MongooseModule.forFeature([
      { name: Setting.name, schema: SettingSchema },
      { name: Tax.name, schema: TaxSchema },
      { name: Discount.name, schema: DiscountSchema },
      { name: PricingRule.name, schema: PricingRuleSchema },
      { name: PaymentMethod.name, schema: PaymentMethodSchema },
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: Role.name, schema: RoleSchema },
      { name: Store.name, schema: StoreSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: WebhookSubscription.name, schema: WebhookSubscriptionSchema },
      { name: ExchangeRate.name, schema: ExchangeRateSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
