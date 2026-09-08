import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type LoyaltyTransactionDocument = LoyaltyTransaction & Document;

@Schema({ timestamps: true })
export class LoyaltyTransaction {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true })
  customerId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: ['earn', 'redeem', 'adjust'], required: true })
  type: string;

  @Prop({ type: Number, required: true })
  points: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SaleOrder', default: null })
  saleId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: '' })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() })
  date: Date;
}

export const LoyaltyTransactionSchema = SchemaFactory.createForClass(LoyaltyTransaction);

LoyaltyTransactionSchema.index({ tenantId: 1, storeId: 1, customerId: 1, date: -1 });
LoyaltyTransactionSchema.index({ tenantId: 1, storeId: 1, saleId: 1 });
