import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type PlanDocument = Plan & Document;

@Schema({ timestamps: true })
export class Plan {
  @ApiProperty()
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @ApiProperty()
  @Prop({ required: true, type: Number })
  price: number;

  @ApiProperty({ description: 'Billing period label: monthly | yearly' })
  @Prop({ default: 'monthly' })
  period: string;

  @ApiProperty({ description: 'Short marketing blurb for pricing cards' })
  @Prop({ default: '' })
  description: string;

  @ApiProperty()
  @Prop({ type: [String], default: [] })
  features: string[];

  @ApiProperty()
  @Prop({ type: Number, default: 0 })
  userLimit: number;

  @ApiProperty()
  @Prop({ type: Number, default: 0 })
  storeLimit: number;

  @ApiProperty()
  @Prop({ type: Number, default: 0 })
  storageLimitMB: number;

  @ApiProperty()
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @ApiProperty()
  @Prop({ type: Number, default: 0 })
  sortOrder: number;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

PlanSchema.index({ isActive: 1, sortOrder: 1 });
