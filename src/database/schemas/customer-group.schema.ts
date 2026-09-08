import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CustomerGroupDocument = CustomerGroup & Document;

@Schema({ timestamps: true })
export class CustomerGroup {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  discountPercent: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;
}

export const CustomerGroupSchema = SchemaFactory.createForClass(CustomerGroup);
CustomerGroupSchema.index({ tenantId: 1, storeId: 1, name: 1 }, { unique: true });
