import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @ApiProperty()
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  title: string;

  @ApiProperty()
  @Prop({ default: '' })
  message: string;

  @ApiProperty()
  @Prop({ default: '' })
  description: string;

  @ApiProperty({
    enum: [
      'info',
      'warning',
      'alert',
      'order',
      'inventory',
      'migration',
      'finance',
      'report',
      'billing',
    ],
  })
  @Prop({
    type: String,
    enum: [
      'info',
      'warning',
      'alert',
      'order',
      'inventory',
      'migration',
      'finance',
      'report',
      'billing',
    ],
    default: 'info',
  })
  type: string;

  @ApiProperty()
  @Prop({ type: Boolean, default: false })
  read: boolean;

  @ApiProperty()
  @Prop({ default: '' })
  link: string;

  /**
   * Optional collapse key for near-duplicate events (e.g. several low-stock
   * alerts within a short window). Notifications sharing a groupKey can be
   * presented as one entry client-side — purely additive, existing creators
   * that don't set it are unaffected.
   */
  @ApiProperty({ required: false })
  @Prop({ default: '' })
  groupKey: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ tenantId: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // Auto-delete after 30 days
