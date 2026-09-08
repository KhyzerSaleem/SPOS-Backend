import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlatformAuditLogDocument = PlatformAuditLog & Document;

@Schema({ collection: 'platform_audit_logs', timestamps: { createdAt: true, updatedAt: false } })
export class PlatformAuditLog {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  actorId: Types.ObjectId;

  @Prop({ required: true })
  actorEmail: string;

  @Prop({ required: true, index: true })
  actorRole: string;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ required: true, index: true })
  entity: string;

  @Prop({ default: '' })
  entityId: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ type: Object, default: null })
  metadata?: Record<string, unknown> | null;

  @Prop({ default: '' })
  ip: string;
}

export const PlatformAuditLogSchema = SchemaFactory.createForClass(PlatformAuditLog);

PlatformAuditLogSchema.index({ createdAt: -1 });
PlatformAuditLogSchema.index({ actorId: 1, createdAt: -1 });
