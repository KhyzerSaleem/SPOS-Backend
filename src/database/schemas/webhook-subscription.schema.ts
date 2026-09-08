import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type WebhookSubscriptionDocument = WebhookSubscription & Document;

export const WEBHOOK_EVENTS = ['sale.created', 'stock.low'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

@Schema({ timestamps: true })
export class WebhookSubscription {
  @ApiProperty()
  @Prop({ type: Types.ObjectId, required: true })
  tenantId: Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true, trim: true })
  url: string;

  @ApiProperty()
  @Prop({ required: true })
  secret: string;

  @ApiProperty({ type: [String] })
  @Prop({ type: [String], default: [] })
  events: WebhookEvent[];

  @ApiProperty()
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ default: '' })
  description?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  deliveryAttempts: number;

  @Prop({ type: Date, default: null })
  lastDeliveredAt: Date;

  @Prop({ type: Date, default: null })
  lastFailedAt: Date;

  @Prop({ type: Number, default: null })
  lastResponseStatus: number;

  @Prop({ type: String, default: '' })
  lastError: string;
}

export const WebhookSubscriptionSchema = SchemaFactory.createForClass(WebhookSubscription);

WebhookSubscriptionSchema.index({ tenantId: 1, isActive: 1 });
WebhookSubscriptionSchema.index({ tenantId: 1, url: 1 }, { unique: true });
