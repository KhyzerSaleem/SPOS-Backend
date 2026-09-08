import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AttributeSetDocument = AttributeSet & Document;

@Schema({ timestamps: true })
export class AttributeSet {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [String], default: [] })
  values: string[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const AttributeSetSchema = SchemaFactory.createForClass(AttributeSet);

AttributeSetSchema.index({ tenantId: 1, name: 1 }, { unique: true });
