import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from '../../database/schemas/audit-log.schema';
import {
  WebhookSubscription,
  WebhookSubscriptionSchema,
} from '../../database/schemas/webhook-subscription.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { AuditService } from '../services/audit.service';
import { PlanLimitsService } from '../services/plan-limits.service';
import { WebhookDispatchService } from '../services/webhook-dispatch.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: WebhookSubscription.name, schema: WebhookSubscriptionSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  providers: [AuditService, PlanLimitsService, WebhookDispatchService],
  exports: [MongooseModule, AuditService, PlanLimitsService, WebhookDispatchService],
})
export class PlatformServicesModule {}
