import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PurchaseOrderDocument = PurchaseOrder & Document;

@Schema()
export class PurchaseOrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: null })
  variantId: string;

  @Prop({ required: true })
  productName: string;

  @Prop({ type: Number, required: true, min: 0 })
  quantity: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitCost: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseUnitCost: number;

  @Prop({ type: Number, default: 0, min: 0 })
  taxPercent: number;

  @Prop({ type: Number, default: 0, min: 0 })
  received: number;
}

export const PurchaseOrderItemSchema = SchemaFactory.createForClass(PurchaseOrderItem);

@Schema({ timestamps: true })
export class PurchaseOrder {
  @Prop({ required: true })
  poNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Supplier', required: true })
  supplierId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', default: null })
  warehouseId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [PurchaseOrderItemSchema], default: [] })
  items: PurchaseOrderItem[];

  @Prop({ type: Number, default: 0, min: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseSubtotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  taxTotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseTaxTotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  discount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseDiscount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  shipping: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseShipping: number;

  @Prop({ type: Number, required: true, min: 0 })
  totalAmount: number;

  @Prop({ type: String, uppercase: true, trim: true, default: null })
  currency: string;

  @Prop({ type: String, uppercase: true, trim: true, default: null })
  baseCurrency: string;

  @Prop({ type: Number, default: 1, min: 0 })
  exchangeRate: number;

  @Prop({ type: Date, default: null })
  exchangeRateDate: Date;

  @Prop({ type: Boolean, default: false })
  exchangeRateMissing: boolean;

  @Prop({ type: Number, default: 0, min: 0 })
  baseTotalAmount: number;

  @Prop({
    type: String,
    enum: [
      'draft',
      'pending_approval',
      'approved',
      'ordered',
      'partially_received',
      'completed',
      'cancelled',
    ],
    default: 'draft',
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  approvedBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, default: null })
  approvedAt: Date;

  @Prop({ type: Date, default: null })
  expectedDate: Date;

  @Prop({ type: String, default: '' })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);

PurchaseOrderSchema.index({ tenantId: 1, storeId: 1, status: 1 });
PurchaseOrderSchema.index({ tenantId: 1, storeId: 1, supplierId: 1 });
PurchaseOrderSchema.index({ tenantId: 1, storeId: 1, poNumber: 1 }, { unique: true });
PurchaseOrderSchema.index({ tenantId: 1, storeId: 1, createdAt: -1 });
