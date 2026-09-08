import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TransferDocument = Transfer & Document;

@Schema()
class TransferItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant', default: null })
  variantId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  productName: string;

  @Prop({ type: Number, required: true, min: 0 })
  quantity: number;

  @Prop({ enum: ['pending', 'sent', 'received'], default: 'pending' })
  status: string;
}

@Schema({ timestamps: true })
export class Transfer {
  @Prop({ required: true })
  transferNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', required: true })
  fromWarehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  fromWarehouseName: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', required: true })
  toWarehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  toWarehouseName: string;

  @Prop({ type: [TransferItem], default: [] })
  items: TransferItem[];

  @Prop({ enum: ['draft', 'in_transit', 'completed', 'cancelled'], default: 'draft' })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', default: null })
  fromStoreId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', default: null })
  toStoreId: MongooseSchema.Types.ObjectId;
}

export const TransferSchema = SchemaFactory.createForClass(Transfer);
TransferSchema.index({ tenantId: 1, storeId: 1, date: -1 });
TransferSchema.index({ tenantId: 1, storeId: 1, status: 1 });
TransferSchema.index({ tenantId: 1, storeId: 1, transferNumber: 1 }, { unique: true });
TransferSchema.index({ tenantId: 1, storeId: 1, fromWarehouseId: 1 });
TransferSchema.index({ tenantId: 1, storeId: 1, toWarehouseId: 1 });
