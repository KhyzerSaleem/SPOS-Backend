import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type BillingInvoiceDocument = BillingInvoice & Document;

@Schema({ timestamps: true })
export class BillingInvoice {
  @ApiProperty()
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Subscription' })
  subscriptionId: MongooseSchema.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  invoiceNumber: string;

  @ApiProperty()
  @Prop({ type: Number, required: true })
  amount: number;

  @ApiProperty()
  @Prop({ default: 'USD' })
  currency: string;

  @ApiProperty({ enum: ['paid', 'pending', 'failed', 'refunded'] })
  @Prop({ type: String, enum: ['paid', 'pending', 'failed', 'refunded'], default: 'pending' })
  status: string;

  @ApiProperty()
  @Prop({ default: '' })
  description: string;

  @ApiProperty()
  @Prop({ default: '' })
  planName: string;

  @ApiProperty()
  @Prop({ type: String, enum: ['stripe', 'paypal', 'manual', 'system'], default: 'system' })
  paymentMethod: string;

  @ApiProperty()
  @Prop({ default: '' })
  transactionId: string;

  @ApiProperty()
  @Prop({ type: Date })
  paidAt: Date;

  @ApiProperty()
  @Prop({ type: Date })
  dueDate: Date;
}

export const BillingInvoiceSchema = SchemaFactory.createForClass(BillingInvoice);

BillingInvoiceSchema.index({ tenantId: 1, createdAt: -1 });
BillingInvoiceSchema.index({ tenantId: 1, status: 1 });
BillingInvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
BillingInvoiceSchema.index({ dueDate: 1, status: 1 });
