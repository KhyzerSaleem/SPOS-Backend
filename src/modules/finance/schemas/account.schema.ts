import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AccountDocument = Account & Document;

@Schema({ timestamps: true })
export class Account {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop({
    type: String,
    enum: ['asset', 'liability', 'equity', 'revenue', 'expense'],
    required: true,
  })
  type: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', default: null })
  parentId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  balance: number;
}

export const AccountSchema = SchemaFactory.createForClass(Account);

AccountSchema.index({ tenantId: 1, code: 1 }, { unique: true });
AccountSchema.index({ tenantId: 1, type: 1 });
AccountSchema.index({ tenantId: 1, parentId: 1 });
AccountSchema.index({ tenantId: 1, isActive: 1 });
