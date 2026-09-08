import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type StockMovementDocument = StockMovement & Document;

@Schema({ timestamps: true })
export class StockMovement {
  @Prop({ required: true, enum: ['in', 'out', 'adjustment', 'transfer_in', 'transfer_out'] })
  type: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant', default: null })
  variantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', required: true })
  warehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, required: true })
  quantity: number;

  @Prop({ default: '' })
  reason: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  referenceId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
StockMovementSchema.index({ tenantId: 1, storeId: 1, productId: 1, date: -1 });
StockMovementSchema.index({ tenantId: 1, storeId: 1, warehouseId: 1, date: -1 });
StockMovementSchema.index({ tenantId: 1, storeId: 1, type: 1, date: -1 });
