import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type BankReconciliationDocument = BankReconciliation & Document;

/**
 * One posted journal line that the user has ticked as "cleared" — i.e. it
 * appears on the bank statement being reconciled. Keyed by the entry + the
 * line's subdocument _id so it stays stable even if the entry has several lines
 * touching the same account. `amount` is the signed effect on the account
 * balance (debit-normal: debit − credit), stored so a completed reconciliation
 * can report its cleared total without re-reading the journal.
 */
@Schema({ _id: false })
export class ClearedItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  entryId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  lineId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  amount: number;
}

export const ClearedItemSchema = SchemaFactory.createForClass(ClearedItem);

@Schema({ timestamps: true })
export class BankReconciliation {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true })
  accountId: MongooseSchema.Types.ObjectId;

  /** Statement closing date being reconciled to. */
  @Prop({ type: Date, required: true })
  statementDate: Date;

  /** Closing balance printed on the bank statement. */
  @Prop({ type: Number, default: 0 })
  statementEndingBalance: number;

  /**
   * Cleared balance carried in from all previously *completed* reconciliations
   * for this account — the reconciled starting point for this session.
   */
  @Prop({ type: Number, default: 0 })
  openingBalance: number;

  @Prop({ type: [ClearedItemSchema], default: [] })
  clearedItems: ClearedItem[];

  /** openingBalance + Σ(clearedItems.amount), recomputed on every save. */
  @Prop({ type: Number, default: 0 })
  clearedBalance: number;

  /** statementEndingBalance − clearedBalance; a completed reconciliation is 0. */
  @Prop({ type: Number, default: 0 })
  difference: number;

  @Prop({ type: String, enum: ['in_progress', 'completed'], default: 'in_progress' })
  status: string;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: Date, default: null })
  completedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  completedBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', default: null })
  storeId: MongooseSchema.Types.ObjectId;
}

export const BankReconciliationSchema = SchemaFactory.createForClass(BankReconciliation);

BankReconciliationSchema.index({ tenantId: 1, accountId: 1, status: 1 });
BankReconciliationSchema.index({ tenantId: 1, accountId: 1, statementDate: -1 });
// At most one open draft per account, so the workspace always resumes the same
// session instead of spawning duplicates.
BankReconciliationSchema.index(
  { tenantId: 1, accountId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'in_progress' },
  },
);
