import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type FinancialPeriodDocument = FinancialPeriod & Document;

@Schema({ timestamps: true })
export class FinancialPeriod {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({
    type: String,
    enum: ['open', 'closed'],
    default: 'open',
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const FinancialPeriodSchema = SchemaFactory.createForClass(FinancialPeriod);

FinancialPeriodSchema.index({ tenantId: 1, status: 1 });
FinancialPeriodSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });
