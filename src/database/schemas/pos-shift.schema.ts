import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PosShiftDocument = PosShift & Document;

@Schema({ _id: false })
export class ShiftTotals {
  @Prop({ type: Number, default: 0 })
  salesCount: number;

  @Prop({ type: Number, default: 0 })
  grossSales: number;

  @Prop({ type: Number, default: 0 })
  refunds: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  byTender: Record<string, number>;
}

export const ShiftTotalsSchema = SchemaFactory.createForClass(ShiftTotals);

@Schema({ timestamps: true })
export class PosShift {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, default: 'default' })
  terminalId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  cashierId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, required: true })
  openedAt: Date;

  @Prop({ type: Date, default: null })
  closedAt: Date;

  @Prop({ type: Number, required: true })
  openingFloat: number;

  @Prop({ type: Number, default: null, required: false })
  closingFloat?: number | null;

  @Prop({ type: Number, default: 0 })
  expectedCash: number;

  @Prop({ type: Number, default: null })
  countedCash: number;

  @Prop({ type: Number, default: null })
  variance: number;

  @Prop({ type: String, enum: ['open', 'closed'], default: 'open' })
  status: string;

  @Prop({ type: ShiftTotalsSchema, default: () => ({}) })
  totals: ShiftTotals;
}

export const PosShiftSchema = SchemaFactory.createForClass(PosShift);

PosShiftSchema.index({ tenantId: 1, storeId: 1, cashierId: 1, terminalId: 1, status: 1 });
PosShiftSchema.index({ tenantId: 1, storeId: 1, openedAt: -1 });
PosShiftSchema.index(
  { tenantId: 1, storeId: 1, cashierId: 1, terminalId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);
