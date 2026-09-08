import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type GoodsReceivedNoteDocument = GoodsReceivedNote & Document;

@Schema()
export class GRNItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: null })
  variantId: string;

  @Prop({ type: String, default: '' })
  productName: string;

  @Prop({ type: Number, required: true, min: 0 })
  quantity: number;
}

export const GRNItemSchema = SchemaFactory.createForClass(GRNItem);

@Schema({ timestamps: true })
export class GoodsReceivedNote {
  @Prop({ required: true })
  grnNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PurchaseOrder', required: true })
  poId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', default: null })
  warehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [GRNItemSchema], default: [] })
  items: GRNItem[];

  @Prop({ type: Boolean, default: false })
  isPartial: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  receivedBy: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: String, default: '' })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const GoodsReceivedNoteSchema = SchemaFactory.createForClass(GoodsReceivedNote);

GoodsReceivedNoteSchema.index({ tenantId: 1, storeId: 1, poId: 1 });
GoodsReceivedNoteSchema.index({ tenantId: 1, storeId: 1, warehouseId: 1 });
GoodsReceivedNoteSchema.index({ tenantId: 1, storeId: 1, grnNumber: 1 }, { unique: true });
GoodsReceivedNoteSchema.index({ tenantId: 1, storeId: 1, date: -1 });
