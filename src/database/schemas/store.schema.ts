import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type StoreDocument = Store & Document;

@Schema({ timestamps: true })
export class Store {
  @ApiProperty()
  @Prop({ required: true })
  name: string;

  @ApiProperty()
  @Prop({ required: true })
  code: string;

  @ApiProperty()
  @Prop({ default: '' })
  address: string;

  @ApiProperty()
  @Prop({ default: '' })
  phone: string;

  @ApiProperty()
  @Prop({ type: String, required: true, default: 'USD', uppercase: true, trim: true })
  currency: string;

  @ApiProperty()
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse', default: null })
  defaultWarehouse: MongooseSchema.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const StoreSchema = SchemaFactory.createForClass(Store);

StoreSchema.index({ tenantId: 1, code: 1 }, { unique: true });
