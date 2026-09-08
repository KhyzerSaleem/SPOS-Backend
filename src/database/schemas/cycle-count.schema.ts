import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CycleCountDocument = CycleCount & Document;

@Schema()
class CycleCountItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  productName: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant', default: null })
  variantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  expectedQty: number;

  @Prop({ type: Number, default: null, min: 0 })
  countedQty: number;
}

@Schema({ timestamps: true })
export class CycleCount {
  @Prop({ required: true })
  name: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', default: null })
  warehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  warehouseName: string;

  @Prop({ enum: ['pending', 'in_progress', 'completed'], default: 'pending' })
  status: string;

  @Prop({ type: [CycleCountItem], default: [] })
  items: CycleCountItem[];

  @Prop({ required: true })
  date: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;
}

export const CycleCountSchema = SchemaFactory.createForClass(CycleCount);
CycleCountSchema.index({ tenantId: 1, storeId: 1, date: -1 });
CycleCountSchema.index({ tenantId: 1, storeId: 1, status: 1, date: -1 });
CycleCountSchema.index({ tenantId: 1, storeId: 1, warehouseId: 1 });
