import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ExchangeRateDocument = ExchangeRate & Document;

@Schema({ timestamps: true })
export class ExchangeRate {
  @Prop({ required: true, uppercase: true, trim: true })
  fromCurrency: string;

  @Prop({ required: true, uppercase: true, trim: true })
  toCurrency: string;

  @Prop({ type: Number, required: true, min: 0 })
  rate: number;

  @Prop({ type: Date, required: true, default: () => new Date() })
  effectiveAt: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: String, default: 'manual' })
  source: string;

  @Prop({ type: String, default: '' })
  note: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);

ExchangeRateSchema.index({ tenantId: 1, fromCurrency: 1, toCurrency: 1, effectiveAt: -1 });
ExchangeRateSchema.index(
  { tenantId: 1, fromCurrency: 1, toCurrency: 1, effectiveAt: 1 },
  { unique: true },
);
