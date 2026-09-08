import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { Subscription, SubscriptionSchema } from '../../database/schemas/subscription.schema';
import { SubscriptionGuard } from '../guards/subscription.guard';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Subscription.name, schema: SubscriptionSchema }])],
  providers: [
    SubscriptionGuard,
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
  ],
  exports: [SubscriptionGuard, MongooseModule],
})
export class SubscriptionGuardModule {}
