import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type SubscriptionDocument = Subscription & Document;

@Schema({ timestamps: true })
export class Subscription {
  @ApiProperty({ description: 'Tenant this subscription belongs to' })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Plan' })
  planId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  planName: string;

  @Prop({ default: 0 })
  price: number;

  @Prop({
    enum: ['trial', 'active', 'suspended', 'overdue', 'cancelled'],
    default: 'trial',
  })
  status: string;

  @Prop({ enum: ['monthly', 'yearly'], default: 'monthly' })
  billingCycle: string;

  @Prop({ type: Date })
  startDate: Date;

  @Prop({ type: Date })
  renewalDate: Date;

  @Prop({ type: Date, default: null })
  trialEndsAt: Date | null;

  @Prop({ type: Date })
  subscriptionEndDate: Date;

  @Prop({ default: false })
  autoRenew: boolean;

  @Prop({ default: '' })
  stripeCustomerId: string;

  @Prop({ default: '' })
  stripeSubscriptionId: string;

  @Prop({ default: '' })
  paypalSubscriptionId: string;

  /** Days-left values (3, 1, 0) for which trial expiry emails were already sent. */
  @Prop({ type: [Number], default: [] })
  trialExpiryNotificationsSent: number[];

  /** When the subscription entered overdue status (payment failure). */
  @Prop({ type: Date, default: null })
  overdueSince: Date | null;

  /** Days-since-overdue values (0, 3, 7, 14) for which dunning notices were sent. */
  @Prop({ type: [Number], default: [] })
  dunningNotificationsSent: number[];

  /** Days-before-renewal values (7, 3, 1) for which renewal reminders were sent. */
  @Prop({ type: [Number], default: [] })
  renewalRemindersSent: number[];
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ tenantId: 1 }, { unique: true });
SubscriptionSchema.index({ status: 1, trialEndsAt: 1 });
SubscriptionSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
