import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StripeWebhookEventDocument = StripeWebhookEvent & Document;

/** Idempotency store for processed Stripe webhook events. */
@Schema({ timestamps: true })
export class StripeWebhookEvent {
  @Prop({ required: true, unique: true, index: true })
  eventId: string;

  @Prop({ required: true })
  type: string;

  @Prop({ type: Date, default: Date.now })
  processedAt: Date;
}

export const StripeWebhookEventSchema = SchemaFactory.createForClass(StripeWebhookEvent);

StripeWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
