import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema({ timestamps: true })
export class Product {
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

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  price: number;

  @Prop({ type: Number, default: 0, min: 0 })
  costPrice: number;

  @Prop({ type: Number, default: 0, min: 0 })
  stock: number;

  @Prop({ type: Number, default: 0, min: 0 })
  reorderPoint: number;

  @Prop({ type: Number, default: 0, min: 0 })
  taxRate: number;

  @Prop({ type: String, default: null })
  discountType: string;

  @Prop({ type: Number, default: 0, min: 0 })
  discountValue: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Boolean, default: false })
  isWeighted: boolean;

  @Prop({ type: Boolean, default: false })
  trackBatches: boolean;

  /** Links shadow store product to tenant catalog (central catalog mode). */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CatalogProduct', default: null })
  catalogProductId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  deletedBy: MongooseSchema.Types.ObjectId | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index(
  { tenantId: 1, storeId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
ProductSchema.index(
  { tenantId: 1, storeId: 1, barcode: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, barcode: { $exists: true, $gt: '' } },
  },
);
ProductSchema.index(
  { tenantId: 1, storeId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
ProductSchema.index({ tenantId: 1, storeId: 1, stock: 1, reorderPoint: 1 });
ProductSchema.index({ tenantId: 1, categoryId: 1 });
ProductSchema.index({ tenantId: 1, brandId: 1 });
ProductSchema.index({ tenantId: 1, storeId: 1, name: 'text', sku: 'text', barcode: 'text' });
ProductSchema.index({ tenantId: 1, storeId: 1, deletedAt: 1 });
