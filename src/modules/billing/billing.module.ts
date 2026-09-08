import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingController } from './billing.controller';
import { WebhooksController } from './webhooks.controller';
import { BillingService } from './billing.service';
import { Plan, PlanSchema } from '../../database/schemas/plan.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { Subscription, SubscriptionSchema } from '../../database/schemas/subscription.schema';
import {
  BillingInvoice,
  BillingInvoiceSchema,
} from '../../database/schemas/billing-invoice.schema';
import {
  StripeWebhookEvent,
  StripeWebhookEventSchema,
} from '../../database/schemas/stripe-webhook-event.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import { Setting, SettingSchema } from '../../database/schemas/settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: BillingInvoice.name, schema: BillingInvoiceSchema },
      { name: StripeWebhookEvent.name, schema: StripeWebhookEventSchema },
      { name: User.name, schema: UserSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Product.name, schema: ProductSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: Setting.name, schema: SettingSchema },
    ]),
  ],
  controllers: [BillingController, WebhooksController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
