import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PurchaseReturnDocument = PurchaseReturn & Document;

@Schema()
export class PurchaseReturnItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: null })
  variantId: string;

  @Prop({ type: String, default: '' })
  productName: string;

  @Prop({ type: Number, required: true, min: 0 })
  quantity: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitCost: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseUnitCost: number;
}

export const PurchaseReturnItemSchema = SchemaFactory.createForClass(PurchaseReturnItem);

@Schema({ timestamps: true })
export class PurchaseReturn {
  @Prop({ required: true })
  returnNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PurchaseOrder', required: true })
  poId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Supplier', required: true })
  supplierId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [PurchaseReturnItemSchema], default: [] })
  items: PurchaseReturnItem[];

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
  appliedAmount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseAppliedAmount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  supplierCreditAmount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseSupplierCreditAmount: number;

  @Prop({ type: String, enum: ['unapplied', 'partially_applied', 'applied'], default: 'unapplied' })
  creditStatus: string;

  @Prop({ type: String, default: '' })
  reason: string;

  @Prop({ type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: String, default: '' })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const PurchaseReturnSchema = SchemaFactory.createForClass(PurchaseReturn);

PurchaseReturnSchema.index({ tenantId: 1, storeId: 1, poId: 1 });
PurchaseReturnSchema.index({ tenantId: 1, storeId: 1, returnNumber: 1 }, { unique: true });
PurchaseReturnSchema.index({ tenantId: 1, storeId: 1, date: -1 });
PurchaseReturnSchema.index({ tenantId: 1, storeId: 1, status: 1 });
PurchaseReturnSchema.index({ tenantId: 1, storeId: 1, supplierId: 1 });
