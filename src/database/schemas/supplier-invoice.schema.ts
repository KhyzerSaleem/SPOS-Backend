import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SupplierInvoiceDocument = SupplierInvoice & Document;

@Schema()
export class SupplierInvoicePayment {
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseAmount: number;

  @Prop({ type: String, default: 'cash' })
  method: string;

  @Prop({ type: String, default: '' })
  reference: string;

  @Prop({ type: Date, default: () => new Date() })
  paidAt: Date;
}

export const SupplierInvoicePaymentSchema = SchemaFactory.createForClass(SupplierInvoicePayment);

@Schema({ timestamps: true })
export class SupplierInvoice {
  @Prop({ required: true })
  invoiceNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PurchaseOrder', required: true })
  poId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Supplier', required: true })
  supplierId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseAmount: number;

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

  @Prop({ type: Number, default: 0, min: 0 })
  paidAmount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  basePaidAmount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  balanceDue: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseBalanceDue: number;

  @Prop({ required: true })
  invoiceDate: Date;

  @Prop({ type: Date, default: null })
  dueDate: Date;

  @Prop({ type: String, enum: ['pending', 'verified', 'paid'], default: 'pending' })
  status: string;

  @Prop({ type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' })
  paymentStatus: string;

  @Prop({ type: [SupplierInvoicePaymentSchema], default: [] })
  payments: SupplierInvoicePayment[];

  @Prop({ type: Date, default: null })
  verifiedAt: Date;

  @Prop({ type: Date, default: null })
  paidAt: Date;

  @Prop({ type: String, default: '' })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const SupplierInvoiceSchema = SchemaFactory.createForClass(SupplierInvoice);

SupplierInvoiceSchema.index({ tenantId: 1, storeId: 1, poId: 1 });
SupplierInvoiceSchema.index({ tenantId: 1, storeId: 1, invoiceNumber: 1 }, { unique: true });
SupplierInvoiceSchema.index({ tenantId: 1, storeId: 1, paymentStatus: 1 });
