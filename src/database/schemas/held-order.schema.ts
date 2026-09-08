import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type HeldOrderDocument = HeldOrder & Document;

@Schema()
export class HeldOrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: null })
  variantId: string;

  @Prop({ required: true })
  productName: string;

  @Prop({ type: Number, required: true })
  quantity: number;

  @Prop({ type: Number, required: true })
  price: number;

  @Prop({ type: Number, default: 0 })
  discount: number;
}

export const HeldOrderItemSchema = SchemaFactory.createForClass(HeldOrderItem);

@Schema({ timestamps: true })
export class HeldOrder {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  cashierId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 'default' })
  terminalId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', default: null })
  customerId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [HeldOrderItemSchema], default: [] })
  items: HeldOrderItem[];

  @Prop({ type: Number, default: 0 })
  discount: number;

  @Prop({ type: String, default: 'percent' })
  discountType: string;

  @Prop({ type: Number, default: 0 })
  globalDiscount: number;

  @Prop({ type: Number, default: 0 })
  taxRate: number;

  @Prop({ type: Number, default: 0 })
  tax: number;

  @Prop({ type: Number, default: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0 })
  total: number;

  @Prop({ type: String, default: 'held' })
  status: string;

  @Prop({ default: '' })
  note: string;
}

export const HeldOrderSchema = SchemaFactory.createForClass(HeldOrder);

HeldOrderSchema.index({ tenantId: 1, storeId: 1, cashierId: 1, status: 1 });
HeldOrderSchema.index({ tenantId: 1, storeId: 1, createdAt: -1 });
