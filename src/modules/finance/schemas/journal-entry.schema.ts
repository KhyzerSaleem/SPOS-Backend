import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type JournalEntryDocument = JournalEntry & Document;

@Schema()
export class JournalLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true })
  accountId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  debit: number;

  @Prop({ type: Number, default: 0 })
  credit: number;

  @Prop({ default: '' })
  description: string;
}

export const JournalLineSchema = SchemaFactory.createForClass(JournalLine);

@Schema({ timestamps: true })
export class JournalEntry {
  @Prop({ required: true })
  entryNumber: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [JournalLineSchema], default: [] })
  lines: JournalLine[];

  @Prop({
    type: String,
    enum: ['draft', 'posted', 'voided'],
    default: 'draft',
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  postedBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  voidedBy: MongooseSchema.Types.ObjectId;

  @Prop({ default: null })
  voidReason: string;

  @Prop({ default: null })
  reference: string;

  @Prop({ type: String, default: null })
  sourceType: string;

  @Prop({ type: String, default: null })
  sourceId: string;

  @Prop({ type: Boolean, default: false })
  autoPosted: boolean;

  @Prop({ type: String, uppercase: true, trim: true, default: null })
  sourceCurrency: string;

  @Prop({ type: String, uppercase: true, trim: true, default: null })
  baseCurrency: string;

  @Prop({ type: Number, default: 1, min: 0 })
  exchangeRate: number;

  @Prop({ type: Date, default: null })
  exchangeRateDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'JournalEntry', default: null })
  reversalOf: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, default: null })
  postedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;
}

export const JournalEntrySchema = SchemaFactory.createForClass(JournalEntry);

JournalEntrySchema.index({ tenantId: 1, storeId: 1, entryNumber: 1 }, { unique: true });
JournalEntrySchema.index({ tenantId: 1, storeId: 1, date: -1 });
JournalEntrySchema.index({ tenantId: 1, storeId: 1, status: 1 });
JournalEntrySchema.index({ tenantId: 1, storeId: 1, reference: 1 });
JournalEntrySchema.index(
  { tenantId: 1, storeId: 1, sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: { $type: 'string' },
      sourceId: { $type: 'string' },
    },
  },
);
