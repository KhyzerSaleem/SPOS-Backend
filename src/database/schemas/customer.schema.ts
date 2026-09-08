import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CustomerDocument = Customer & Document;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  avatar: string;

  @Prop({ default: '' })
  country: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: Number, default: 0, min: 0 })
  loyaltyPoints: number;

  @Prop({ default: 'standard' })
  loyaltyTier: string;

  @Prop({ type: Number, default: 0, min: 0 })
  creditBalance: number;

  @Prop({ type: Number, default: 0, min: 0 })
  creditLimit: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CustomerGroup', default: null })
  groupId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  groupName: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  deletedBy: MongooseSchema.Types.ObjectId | null;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ tenantId: 1, storeId: 1 });
CustomerSchema.index(
  { tenantId: 1, storeId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, phone: { $exists: true, $gt: '' } } },
);
CustomerSchema.index(
  { tenantId: 1, storeId: 1, email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, email: { $exists: true, $gt: '' } } },
);
CustomerSchema.index({ tenantId: 1, storeId: 1, name: 'text', phone: 'text', email: 'text' });
CustomerSchema.index({ tenantId: 1, storeId: 1, deletedAt: 1 });
