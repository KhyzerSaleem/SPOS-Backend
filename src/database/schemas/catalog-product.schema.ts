import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CatalogProductDocument = CatalogProduct & Document;

@Schema({ timestamps: true })
export class CatalogProduct {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true })
  sku: string;

  @Prop({ default: '' })
  barcode: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: '' })
  image: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Category' })
  categoryId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Brand' })
  brandId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Unit' })
  unitId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  hasVariants: boolean;

  @Prop({ type: Number, required: true, default: 0 })
  price: number;

  @Prop({ type: Number, default: 0 })
  costPrice: number;

  @Prop({ type: Number, default: 0 })
  taxRate: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const CatalogProductSchema = SchemaFactory.createForClass(CatalogProduct);
CatalogProductSchema.index({ tenantId: 1, sku: 1 }, { unique: true });
CatalogProductSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
CatalogProductSchema.index({ tenantId: 1, name: 'text', sku: 'text', barcode: 'text' });
