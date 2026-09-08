import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type BatchDocument = Batch & Document;

@Schema({ timestamps: true })
export class Batch {
  @Prop({ required: true })
  batchNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  productName: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant', default: null })
  variantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, default: null })
  expiryDate: Date;

  @Prop({ type: Number, default: 0, min: 0 })
  quantity: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', default: null })
  warehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);
BatchSchema.index({ tenantId: 1, storeId: 1, productId: 1 });
BatchSchema.index({ tenantId: 1, storeId: 1, batchNumber: 1 }, { unique: true });
BatchSchema.index({ tenantId: 1, storeId: 1, expiryDate: 1 });
BatchSchema.index({ tenantId: 1, storeId: 1, warehouseId: 1 });
