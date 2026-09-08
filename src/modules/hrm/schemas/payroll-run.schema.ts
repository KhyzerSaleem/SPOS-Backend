import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PayrollRunDocument = PayrollRun & Document;

@Schema({ _id: false })
class PayrollEmployee {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', required: true })
  employeeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  basicSalary: number;

  @Prop({ type: Number, default: 0, min: 0 })
  allowances: number;

  @Prop({ type: Number, default: 0, min: 0 })
  deductions: number;

  @Prop({ type: Number, default: 0, min: 0 })
  overtime: number;

  @Prop({ type: Number, default: 0, min: 0 })
  bonus: number;

  @Prop({ type: Number, default: 0, min: 0 })
  netPay: number;

  @Prop({ type: String, enum: ['pending', 'paid'], default: 'pending' })
  status: string;
}

@Schema({ timestamps: true })
export class PayrollRun {
  @Prop({ required: true })
  payrollNumber: string;

  @Prop({ type: Number, required: true, min: 1, max: 12 })
  month: number;

  @Prop({ type: Number, required: true, min: 2000 })
  year: number;

  @Prop({
    type: String,
    enum: ['draft', 'processing', 'completed', 'paid'],
    default: 'draft',
  })
  status: string;

  @Prop({ type: [PayrollEmployee], default: [] })
  employees: PayrollEmployee[];

  @Prop({ type: Number, default: 0, min: 0 })
  totalAmount: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  processedBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date })
  paidDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;
}

export const PayrollRunSchema = SchemaFactory.createForClass(PayrollRun);
PayrollRunSchema.index({ tenantId: 1, payrollNumber: 1 }, { unique: true });
PayrollRunSchema.index({ tenantId: 1, year: -1, month: -1 });
PayrollRunSchema.index({ tenantId: 1, status: 1 });
