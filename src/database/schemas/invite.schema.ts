import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type InviteDocument = Invite & Document;

@Schema({ timestamps: true })
export class Invite {
  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  role: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  tenantName: string;

  @Prop({ required: true })
  invitedBy: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true })
  token: string;

  @Prop({ type: [String], default: [] })
  customPermissions: string[];

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Store', default: [] })
  storeAccess: MongooseSchema.Types.ObjectId[];

  @Prop({ enum: ['pending', 'accepted', 'expired'], default: 'pending' })
  status: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const InviteSchema = SchemaFactory.createForClass(Invite);
InviteSchema.index({ token: 1 }, { unique: true });
InviteSchema.index({ email: 1, tenantId: 1 });
InviteSchema.index({ tenantId: 1, status: 1 });
InviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
