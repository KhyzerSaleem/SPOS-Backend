import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ExpenseDocument = Expense & Document;

@Schema({ timestamps: true })
export class Expense {
  @Prop({ required: true })
  expenseNumber: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: false })
  categoryId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  category: string;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseAmount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  tax: number;

  @Prop({ type: Number, default: 0, min: 0 })
  baseTax: number;

  @Prop({
    type: Number,
    required: false,
    min: 0,
    default: function (this: Expense) {
      return (this.amount || 0) + (this.tax || 0);
    },
  })
  total: number;

  @Prop({ type: String, uppercase: true, trim: true, default: null })
  currency: string;

  @Prop({ type: String, uppercase: true, trim: true, default: null })
  baseCurrency: string;

  @Prop({ type: Number, default: 1, min: 0 })
  exchangeRate: number;

  @Prop({ type: Date, default: null })
  exchangeRateDate: Date;

  @Prop({ type: Boolean, default: false })
  exchangeRateMissing: boolean;

  @Prop({ type: Number, default: 0, min: 0 })
  baseTotal: number;

  @Prop({ type: String, default: null })
  paymentMethod: string;

  @Prop({
    type: String,
    enum: ['paid', 'pending', 'partial'],
    default: 'pending',
  })
  paymentStatus: string;

  @Prop({ default: '' })
  vendor: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  reference: string;

  @Prop({ default: '' })
  paidBy: string;

  @Prop({ default: null })
  receipt: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  approvedBy: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  createdBy: MongooseSchema.Types.ObjectId;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

ExpenseSchema.index(
  { tenantId: 1, storeId: 1, expenseNumber: 1 },
  { unique: true, partialFilterExpression: { expenseNumber: { $exists: true, $ne: '' } } },
);
ExpenseSchema.index({ tenantId: 1, storeId: 1, date: -1 });
ExpenseSchema.index({ tenantId: 1, storeId: 1, status: 1 });
ExpenseSchema.index({ tenantId: 1, storeId: 1, categoryId: 1 });
ExpenseSchema.index({ tenantId: 1, storeId: 1, paymentStatus: 1 });
ExpenseSchema.index({ tenantId: 1, storeId: 1, category: 1 });
