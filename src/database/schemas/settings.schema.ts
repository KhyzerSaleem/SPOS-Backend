import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// ── Generic key-value settings ──

export type SettingDocument = Setting & Document;

@Schema({ timestamps: true })
export class Setting {
  @Prop({ required: true })
  key: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  value: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', default: null })
  storeId: MongooseSchema.Types.ObjectId;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
SettingSchema.index({ tenantId: 1, storeId: 1, key: 1 }, { unique: true });

// ── Tax ──

export type TaxDocument = Tax & Document;

@Schema({ timestamps: true })
export class Tax {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 0, max: 100 })
  rate: number;

  @Prop({ type: Date, default: null })
  effectiveDate: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', default: null })
  storeId: MongooseSchema.Types.ObjectId;
}

export const TaxSchema = SchemaFactory.createForClass(Tax);
TaxSchema.index({ tenantId: 1, storeId: 1, name: 1 }, { unique: true });

// ── Discount ──

export type DiscountDocument = Discount & Document;

@Schema({ timestamps: true })
export class Discount {
  @Prop({ required: true })
  name: string;

  @Prop({ enum: ['percentage', 'fixed'], default: 'percentage' })
  type: string;

  @Prop({ required: true, min: 0 })
  value: number;

  @Prop({ type: Number, default: 0, min: 0 })
  minOrderAmount: number;

  @Prop({ type: Number, default: null, min: 0 })
  maxDiscount: number;

  @Prop({ type: Date, default: null })
  startDate: Date;

  @Prop({ type: Date, default: null })
  endDate: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', default: null })
  storeId: MongooseSchema.Types.ObjectId;
}

export const DiscountSchema = SchemaFactory.createForClass(Discount);
DiscountSchema.index({ tenantId: 1, storeId: 1, name: 1 }, { unique: true });

// ── Pricing Rule ──

export type PricingRuleDocument = PricingRule & Document;

@Schema({ timestamps: true })
export class PricingRule {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  customerGroup: string;

  @Prop({ enum: ['percentage', 'fixed', 'price_override'], default: 'percentage' })
  discountType: string;

  @Prop({ required: true, min: 0 })
  discountValue: number;

  @Prop({ default: '' })
  productCategory: string;

  @Prop({ type: Number, default: 1, min: 1 })
  priority: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', default: null })
  storeId: MongooseSchema.Types.ObjectId;
}

export const PricingRuleSchema = SchemaFactory.createForClass(PricingRule);
PricingRuleSchema.index({ tenantId: 1, storeId: 1, name: 1 }, { unique: true });

// ── Payment Method ──

export type PaymentMethodDocument = PaymentMethod & Document;

@Schema({ timestamps: true })
export class PaymentMethod {
  @Prop({ required: true })
  name: string;

  @Prop({ enum: ['cash', 'card', 'mobile', 'bank_transfer', 'cheque', 'other'], default: 'cash' })
  type: string;

  @Prop({ type: Boolean, default: true })
  isEnabled: boolean;

  @Prop({ default: '' })
  instructions: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', default: null })
  storeId: MongooseSchema.Types.ObjectId;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);
PaymentMethodSchema.index({ tenantId: 1, storeId: 1, name: 1 }, { unique: true });

// ── API Key ──

export type ApiKeyDocument = ApiKey & Document;

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  keyHash: string;

  @Prop({ required: true })
  prefix: string;

  @Prop({ type: Date, default: null })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  lastUsed: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: [String], default: ['read'] })
  scopes: string[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ tenantId: 1 });
ApiKeySchema.index({ keyHash: 1 }, { unique: true });
