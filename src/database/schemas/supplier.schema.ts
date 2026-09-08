import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SupplierDocument = Supplier & Document;

@Schema({ timestamps: true })
export class Supplier {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  contact: string;

  @Prop({ type: String, default: '' })
  email: string;

  @Prop({ type: String, default: '' })
  phone: string;

  @Prop({ type: String, default: '' })
  address: string;

  @Prop({ type: String, default: '' })
  taxNumber: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0, min: 0 })
  creditBalance: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseCreditBalance: number;

  @Prop({ type: Number, default: 0, min: 0 })
  payableBalance: number;

  @Prop({ type: Number, default: 0, min: 0 })
  basePayableBalance: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  deletedBy: MongooseSchema.Types.ObjectId | null;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);

SupplierSchema.index({ tenantId: 1, storeId: 1, name: 1 });
SupplierSchema.index({ tenantId: 1, storeId: 1, isActive: 1 });
SupplierSchema.index({ tenantId: 1, storeId: 1, name: 'text', email: 'text', phone: 'text' });
SupplierSchema.index({ tenantId: 1, storeId: 1, deletedAt: 1 });
