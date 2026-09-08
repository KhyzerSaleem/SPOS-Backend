import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type EmailDeliveryLogDocument = EmailDeliveryLog & Document;

/**
 * Durable record of every transactional email attempt — the piece that was
 * missing before: a failed OTP/receipt/invoice send used to only log to
 * console and vanish. This is what a support agent checks for "I never got my
 * code" tickets, and what surfaces genuinely stuck deliveries.
 */
@Schema({ timestamps: true })
export class EmailDeliveryLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', default: null })
  tenantId: MongooseSchema.Types.ObjectId | null;

  @Prop({ required: true, lowercase: true, trim: true })
  to: string;

  @Prop({ required: true })
  subject: string;

  /** e.g. "otp", "welcome", "invoice", "invite" — the EmailService method name. */
  @Prop({ required: true })
  templateType: string;

  @Prop({ type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' })
  status: string;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: String, default: '' })
  lastError: string;

  @Prop({ type: String, default: '' })
  providerMessageId: string;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;
}

export const EmailDeliveryLogSchema = SchemaFactory.createForClass(EmailDeliveryLog);

EmailDeliveryLogSchema.index({ to: 1, createdAt: -1 });
EmailDeliveryLogSchema.index({ tenantId: 1, createdAt: -1 });
EmailDeliveryLogSchema.index({ status: 1, createdAt: -1 });
// Auto-expire after 90 days — long enough for support/debugging, not indefinite PII retention.
EmailDeliveryLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
