import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type StockDocument = Stock & Document;

@Schema({ timestamps: true })
export class Stock {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant', default: null })
  variantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', required: true })
  warehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  quantity: number;

  @Prop({ type: Number, default: 0, min: 0 })
  reserved: number;

  @Prop({ type: Number, default: 5, min: 0 })
  reorderPoint: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null })
  batchId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;
}

export const StockSchema = SchemaFactory.createForClass(Stock);
StockSchema.index(
  { tenantId: 1, storeId: 1, warehouseId: 1, productId: 1, variantId: 1 },
  { unique: true },
);
StockSchema.index({ tenantId: 1, storeId: 1, productId: 1 });
