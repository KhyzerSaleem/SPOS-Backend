import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type BundleDocument = Bundle & Document;

@Schema({ timestamps: true })
export class Bundle {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  childProductId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, required: true, default: 1 })
  quantity: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const BundleSchema = SchemaFactory.createForClass(Bundle);

BundleSchema.index({ productId: 1 });
BundleSchema.index({ productId: 1, childProductId: 1 }, { unique: true });
