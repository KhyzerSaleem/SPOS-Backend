import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @ApiProperty()
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  @ApiProperty({ required: false })
  @Prop({ type: Types.ObjectId, default: null })
  storeId?: Types.ObjectId | null;

  @ApiProperty()
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  userName: string;

  @ApiProperty()
  @Prop({ required: true, index: true })
  action: string;

  @ApiProperty()
  @Prop({ required: true, index: true })
  entity: string;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  entityId: string;

  @ApiProperty()
  @Prop({ required: true })
  summary: string;

  @Prop({ type: Object, default: null })
  before?: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  after?: Record<string, unknown> | null;

  @Prop({ default: '' })
  ip?: string;

  @Prop({ type: Date, default: Date.now, index: true })
  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ tenantId: 1, entity: 1, action: 1 });
