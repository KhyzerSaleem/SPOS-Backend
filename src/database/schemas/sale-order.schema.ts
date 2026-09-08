import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SaleOrderDocument = SaleOrder & Document;

@Schema()
export class SaleOrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop({ type: String, default: null })
  variantId: string;

  @Prop({ type: Number, required: true })
  quantity: number;

  @Prop({ type: Number, required: true })
  price: number;

  @Prop({ type: Number, default: 0 })
  discount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  unitCost: number;

  @Prop({ type: Number, default: 0, min: 0 })
  lineCost: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseUnitCost: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseLineCost: number;

  @Prop({ type: String, default: 'product' })
  costSource: string;

  @Prop({ type: String, default: '' })
  sku: string;

  @Prop({ type: String, default: '' })
  barcode: string;

  @Prop({ type: String, default: '' })
  categoryName: string;

  @Prop({ type: String, default: '' })
  brandName: string;
}

export const SaleOrderItemSchema = SchemaFactory.createForClass(SaleOrderItem);

@Schema()
export class SalePayment {
  @Prop({
    type: String,
    enum: ['cash', 'card', 'mobile', 'bank_transfer', 'cheque', 'other'],
    required: true,
  })
  method: string;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: Number, default: 0 })
  baseAmount: number;

  @Prop({ type: String, default: null })
  transactionId: string;

  @Prop({ type: Date, default: () => new Date() })
  date: Date;
}

export const SalePaymentSchema = SchemaFactory.createForClass(SalePayment);

@Schema({ timestamps: true })
export class SaleOrder {
  @Prop({ required: true })
  orderNumber: string;

  @Prop({ type: String, default: null })
  invoiceNumber: string;

  @Prop({ type: Number, required: true })
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

  @Prop({ type: Number, default: 0 })
  baseTotalAmount: number;

  @Prop({
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'processing', 'onhold', 'refunded'],
    default: 'completed',
  })
  status: string;

  @Prop({ type: String, enum: ['paid', 'partial', 'unpaid'], default: 'paid' })
  paymentStatus: string;

  @Prop({ type: String, enum: ['sale', 'return'], required: true })
  type: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: Date, default: null })
  paymentDueDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
  customerId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [SaleOrderItemSchema], default: [] })
  items: SaleOrderItem[];

  @Prop({ type: [SalePaymentSchema], default: [] })
  payments: SalePayment[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  cashierId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: 'default' })
  terminalId: string;

  @Prop({ type: Number, default: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0 })
  baseSubtotal: number;

  @Prop({ type: Number, default: 0 })
  discount: number;

  @Prop({ type: Number, default: 0 })
  baseDiscount: number;

  @Prop({ type: Number, default: 0 })
  tax: number;

  @Prop({ type: Number, default: 0 })
  baseTax: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SaleOrder', default: null })
  returnRef: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: '' })
  returnReason: string;

  @Prop({ type: String, default: '' })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PosShift', default: null })
  shiftId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: null })
  exchangeId: string;

  @Prop({ type: Number, default: 0 })
  loyaltyPointsRedeemed: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const SaleOrderSchema = SchemaFactory.createForClass(SaleOrder);

SaleOrderSchema.index({ tenantId: 1, storeId: 1, date: -1 });
SaleOrderSchema.index({ tenantId: 1, storeId: 1, type: 1, status: 1 });
SaleOrderSchema.index({ tenantId: 1, storeId: 1, customerId: 1, date: -1 });
SaleOrderSchema.index({ tenantId: 1, storeId: 1, 'items.productId': 1 });
SaleOrderSchema.index({ tenantId: 1, storeId: 1, cashierId: 1, date: -1 });
SaleOrderSchema.index({ tenantId: 1, storeId: 1, invoiceNumber: 1 });
SaleOrderSchema.index({ tenantId: 1, storeId: 1, orderNumber: 1 }, { unique: true });
SaleOrderSchema.index({ tenantId: 1, storeId: 1, paymentStatus: 1, date: -1 });
