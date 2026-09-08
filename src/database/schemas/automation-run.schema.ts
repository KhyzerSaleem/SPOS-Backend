import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AutomationRunDocument = AutomationRun & Document;

@Schema({ timestamps: true })
export class AutomationRun {
  @Prop({ required: true, index: true })
  jobName: string;

  @Prop({ enum: ['success', 'failed', 'skipped'], default: 'success' })
  status: string;

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date })
  completedAt: Date;

  @Prop({ default: '' })
  summary: string;

  @Prop({ type: Number, default: 0 })
  processed: number;

  @Prop({ type: Number, default: 0 })
  notified: number;

  @Prop({ type: Number, default: 0 })
  skipped: number;

  @Prop({ type: Number, default: 0 })
  errors: number;

  @Prop({ default: '' })
  error: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', default: null })
  tenantId: MongooseSchema.Types.ObjectId | null;
}

export const AutomationRunSchema = SchemaFactory.createForClass(AutomationRun);

AutomationRunSchema.index({ jobName: 1, startedAt: -1 });
AutomationRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
