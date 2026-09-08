import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type StockAdjustmentDocument = StockAdjustment & Document;

@Schema()
class AdjustmentItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant', default: null })
  variantId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  productName: string;

  @Prop({ type: Number, required: true })
  quantity: number;

  @Prop({ required: true })
  reason: string;
}

@Schema({ timestamps: true })
export class StockAdjustment {
  @Prop({ required: true })
  adjustmentNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
  warehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  warehouseName: string;

  @Prop({ type: [AdjustmentItem], default: [] })
  items: AdjustmentItem[];

  @Prop({ enum: ['draft', 'completed'], default: 'completed' })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ default: '' })
  note: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;
}

export const StockAdjustmentSchema = SchemaFactory.createForClass(StockAdjustment);
StockAdjustmentSchema.index({ tenantId: 1, storeId: 1, date: -1 });
StockAdjustmentSchema.index({ tenantId: 1, storeId: 1, adjustmentNumber: 1 }, { unique: true });
StockAdjustmentSchema.index({ tenantId: 1, storeId: 1, warehouseId: 1, date: -1 });
