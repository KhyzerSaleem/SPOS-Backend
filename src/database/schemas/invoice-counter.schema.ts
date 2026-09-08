import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type InvoiceCounterDocument = InvoiceCounter & Document;

@Schema({ timestamps: true })
export class InvoiceCounter {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: 'INV' })
  prefix: string;

  @Prop({ type: Number, default: 0 })
  lastNumber: number;

  /** Monotonic POS / sales order sequence (SO-000001, …) per store */
  @Prop({ type: Number, default: 0 })
  lastOrderNumber: number;

  @Prop({ type: Number, default: 0 })
  lastPurchaseOrderNumber: number;

  @Prop({ type: Number, default: 0 })
  lastGoodsReceivedNumber: number;

  @Prop({ type: Number, default: 0 })
  lastPurchaseReturnNumber: number;
}

export const InvoiceCounterSchema = SchemaFactory.createForClass(InvoiceCounter);

InvoiceCounterSchema.index({ tenantId: 1, storeId: 1 }, { unique: true });
