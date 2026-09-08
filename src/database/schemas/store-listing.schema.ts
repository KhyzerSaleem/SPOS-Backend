import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type StoreListingDocument = StoreListing & Document;

@Schema({ timestamps: true })
export class StoreListing {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CatalogProduct', required: true })
  catalogProductId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, required: true, default: 0 })
  price: number;

  @Prop({ type: Number, default: 0 })
  costPrice: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ default: '' })
  localSku: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', default: null })
  shadowProductId: MongooseSchema.Types.ObjectId;
}

export const StoreListingSchema = SchemaFactory.createForClass(StoreListing);
StoreListingSchema.index({ catalogProductId: 1, storeId: 1 }, { unique: true });
StoreListingSchema.index({ tenantId: 1, storeId: 1 });
StoreListingSchema.index({ tenantId: 1, catalogProductId: 1 });
