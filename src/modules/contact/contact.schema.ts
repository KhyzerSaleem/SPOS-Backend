import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContactSubmissionDocument = ContactSubmission & Document;

@Schema({ timestamps: true })
export class ContactSubmission {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  company: string;

  @Prop()
  phone: string;

  @Prop()
  subject: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: 'new', enum: ['new', 'read', 'replied', 'archived'] })
  status: string;

  @Prop()
  repliedAt: Date;

  @Prop()
  notes: string;

  @Prop({
    type: [
      {
        message: { type: String, required: true },
        sentAt: { type: Date, default: Date.now },
        sentBy: { type: String, default: '' },
      },
    ],
    default: [],
  })
  replies: Array<{ message: string; sentAt: Date; sentBy?: string }>;
}

export const ContactSubmissionSchema = SchemaFactory.createForClass(ContactSubmission);
