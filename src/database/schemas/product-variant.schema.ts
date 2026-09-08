import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ProductVariantDocument = ProductVariant & Document;

@Schema({ timestamps: true })
export class ProductVariant {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Map, of: String, default: {} })
  attributeValues: Map<string, string>;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  price: number;

  @Prop({ type: Number, default: 0, min: 0 })
  cost: number;

  @Prop({ type: Number, default: 0, min: 0 })
  stock: number;

  @Prop({ required: true })
  sku: string;

  @Prop({ default: '' })
  image: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;
}

export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

ProductVariantSchema.index({ tenantId: 1, storeId: 1, productId: 1 });
ProductVariantSchema.index({ tenantId: 1, storeId: 1, sku: 1 }, { unique: true });
ProductVariantSchema.index({ tenantId: 1, storeId: 1, isActive: 1 });
