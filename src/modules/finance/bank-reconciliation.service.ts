import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument } from './schemas/account.schema';
import { JournalEntry, JournalEntryDocument } from './schemas/journal-entry.schema';
import {
  BankReconciliation,
  BankReconciliationDocument,
} from './schemas/bank-reconciliation.schema';
import { SaveReconciliationDto } from './dto/save-reconciliation.dto';
import { roundMoney, toMinorUnits } from '../../common/utils/money.util';
import { CurrencyService } from '../../common/services/currency.service';

interface LedgerLine {
  entryId: string;
  lineId: string;
  entryNumber: string;
  date: Date;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  amount: number; // signed effect on the account (debit-normal)
}

@Injectable()
export class BankReconciliationService {
  constructor(
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name)
    private readonly journalEntryModel: Model<JournalEntryDocument>,
    @InjectModel(BankReconciliation.name)
    private readonly reconciliationModel: Model<BankReconciliationDocument>,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Candidate accounts to reconcile — asset accounts (cash/bank live here). Each
   * carries its current book balance so the picker can show it at a glance.
   */
  async listBankAccounts(tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    const accounts = await this.accountModel
      .find({ tenantId: tid, type: 'asset', isActive: true })
      .sort({ code: 1 })
      .lean();

    const balances = await this.journalEntryModel.aggregate([
      { $match: { tenantId: tid, status: 'posted' } },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.accountId',
          totalDebit: { $sum: '$lines.debit' },
          totalCredit: { $sum: '$lines.credit' },
        },
      },
    ]);
    const balanceMap = new Map(balances.map((b) => [String(b._id), b.totalDebit - b.totalCredit]));

    const lastReconciliations = await this.reconciliationModel
      .find({ tenantId: tid, status: 'completed' })
      .sort({ statementDate: -1 })
      .lean();
    const lastByAccount = new Map<string, any>();
    for (const rec of lastReconciliations) {
      const key = String(rec.accountId);
      if (!lastByAccount.has(key)) lastByAccount.set(key, rec);
    }

    return accounts.map((a) => {
      const last = lastByAccount.get(String(a._id));
      return {
        id: a._id,
        code: a.code,
        name: a.name,
        bookBalance: roundMoney(balanceMap.get(String(a._id)) || 0),
        lastReconciledDate: last?.statementDate ?? null,
        lastReconciledBalance: last ? roundMoney(last.clearedBalance) : null,
      };
    });
  }

  /** All posted journal lines for an account, each with a stable line id. */
  private async ledgerLines(
    tenantId: Types.ObjectId,
    accountId: Types.ObjectId,
    upto?: Date,
  ): Promise<LedgerLine[]> {
    const match: any = {
      tenantId,
      status: 'posted',
      'lines.accountId': accountId,
    };
    if (upto) match.date = { $lte: upto };

    const rows = await this.journalEntryModel.aggregate([
      { $match: match },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': accountId } },
      { $sort: { date: 1, entryNumber: 1 } },
      {
        $project: {
          entryNumber: 1,
          date: 1,
          description: 1,
          reference: 1,
          lineId: '$lines._id',
          debit: '$lines.debit',
          credit: '$lines.credit',
          lineDescription: '$lines.description',
        },
      },
    ]);

    return (rows as any[]).map((r) => ({
      entryId: String(r._id),
      lineId: String(r.lineId),
      entryNumber: r.entryNumber,
      date: r.date,
      description: r.lineDescription || r.description || '',
      reference: r.reference || '',
      debit: r.debit || 0,
      credit: r.credit || 0,
      amount: roundMoney((r.debit || 0) - (r.credit || 0)),
    }));
  }

  /** Set of `${entryId}:${lineId}` already cleared in a completed reconciliation. */
  private async reconciledKeySet(
    tenantId: Types.ObjectId,
    accountId: Types.ObjectId,
  ): Promise<{ keys: Set<string>; openingBalance: number }> {
    const completed = await this.reconciliationModel
      .find({ tenantId, accountId, status: 'completed' })
      .select('clearedItems clearedBalance statementDate')
      .lean();

    const keys = new Set<string>();
    for (const rec of completed) {
      for (const item of rec.clearedItems || []) {
        keys.add(`${String(item.entryId)}:${String(item.lineId)}`);
      }
    }
    // The opening (already-reconciled) balance is the cleared balance of the
    // most recent completed reconciliation for this account.
    const latest = completed
      .slice()
      .sort((a, b) => new Date(b.statementDate).getTime() - new Date(a.statementDate).getTime())[0];
    return { keys, openingBalance: latest ? latest.clearedBalance : 0 };
  }

  private sumCleared(lines: LedgerLine[]): number {
    const minor = lines.reduce((sum, l) => sum + toMinorUnits(l.amount), 0);
    return roundMoney(minor / 100);
  }

  /**
   * The reconciliation workspace for an account: the open draft (if any), the
   * uncleared lines available to tick, and the live cleared/difference figures.
   */
  async getWorkspace(tenantId: string, accountId: string, statementDate?: string) {
    const tid = new Types.ObjectId(tenantId);
    if (!Types.ObjectId.isValid(accountId)) {
      throw new BadRequestException('Invalid account id');
    }
    const aid = new Types.ObjectId(accountId);

    const account = await this.accountModel.findOne({ _id: aid, tenantId: tid }).lean();
    if (!account) throw new NotFoundException('Account not found');

    const baseCurrency = await this.currencyService.resolveTenantBaseCurrency(tenantId);
    const { keys: reconciledKeys, openingBalance } = await this.reconciledKeySet(tid, aid);

    const draft = await this.reconciliationModel
      .findOne({ tenantId: tid, accountId: aid, status: 'in_progress' })
      .lean();

    const effectiveDate = statementDate
      ? new Date(statementDate)
      : draft?.statementDate
        ? new Date(draft.statementDate)
        : undefined;

    const allLines = await this.ledgerLines(tid, aid, effectiveDate);
    // Lines already locked into a completed reconciliation are removed — they're
    // no longer part of the outstanding set.
    const outstanding = allLines.filter((l) => !reconciledKeys.has(`${l.entryId}:${l.lineId}`));

    const draftClearedKeys = new Set(
      (draft?.clearedItems || []).map((i) => `${String(i.entryId)}:${String(i.lineId)}`),
    );

    const lines = outstanding.map((l) => ({
      ...l,
      cleared: draftClearedKeys.has(`${l.entryId}:${l.lineId}`),
    }));

    const clearedLines = lines.filter((l) => l.cleared);
    const clearedBalance = roundMoney(openingBalance + this.sumCleared(clearedLines));
    const statementEndingBalance = draft?.statementEndingBalance ?? 0;
    const bookBalance = roundMoney(openingBalance + this.sumCleared(outstanding));

    return {
      account: { id: account._id, code: account.code, name: account.name },
      baseCurrency,
      statementDate: effectiveDate ?? null,
      statementEndingBalance,
      openingBalance: roundMoney(openingBalance),
      bookBalance,
      clearedBalance,
      unclearedCount: lines.length - clearedLines.length,
      difference: roundMoney(statementEndingBalance - clearedBalance),
      draftId: draft?._id ?? null,
      notes: draft?.notes ?? '',
      lines,
    };
  }

  /** Create or update the open draft for an account (idempotent per account). */
  async save(tenantId: string, userId: string, dto: SaveReconciliationDto) {
    const tid = new Types.ObjectId(tenantId);
    const aid = new Types.ObjectId(dto.accountId);

    const account = await this.accountModel.findOne({ _id: aid, tenantId: tid }).lean();
    if (!account) throw new NotFoundException('Account not found');

    const statementDate = new Date(dto.statementDate);
    const { keys: reconciledKeys, openingBalance } = await this.reconciledKeySet(tid, aid);
    const ledger = await this.ledgerLines(tid, aid, statementDate);
    const ledgerByKey = new Map(ledger.map((l) => [`${l.entryId}:${l.lineId}`, l]));

    // Only accept cleared items that are real, still-outstanding lines for this
    // account — silently drop anything reconciled elsewhere or unknown.
    const clearedItems: {
      entryId: Types.ObjectId;
      lineId: Types.ObjectId;
      amount: number;
    }[] = [];
    for (const item of dto.clearedItems || []) {
      const key = `${item.entryId}:${item.lineId}`;
      if (reconciledKeys.has(key)) continue;
      const line = ledgerByKey.get(key);
      if (!line) continue;
      clearedItems.push({
        entryId: new Types.ObjectId(item.entryId),
        lineId: new Types.ObjectId(item.lineId),
        amount: line.amount,
      });
    }

    const clearedSum = roundMoney(
      clearedItems.reduce((s, i) => s + toMinorUnits(i.amount), 0) / 100,
    );
    const clearedBalance = roundMoney(openingBalance + clearedSum);
    const difference = roundMoney(dto.statementEndingBalance - clearedBalance);

    const draft = await this.reconciliationModel.findOneAndUpdate(
      { tenantId: tid, accountId: aid, status: 'in_progress' },
      {
        $set: {
          statementDate,
          statementEndingBalance: dto.statementEndingBalance,
          openingBalance,
          clearedItems,
          clearedBalance,
          difference,
          notes: dto.notes ?? '',
          storeId: null,
        },
        $setOnInsert: { createdBy: new Types.ObjectId(userId) },
      },
      { new: true, upsert: true },
    );

    return draft;
  }

  /** Finalise a draft — only allowed when it reconciles to zero. */
  async complete(tenantId: string, id: string, userId: string) {
    const tid = new Types.ObjectId(tenantId);
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid reconciliation id');
    }
    const draft = await this.reconciliationModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: tid,
      status: 'in_progress',
    });
    if (!draft) throw new NotFoundException('Open reconciliation not found');

    if (Math.abs(draft.difference) > 0.005) {
      throw new BadRequestException(
        `Cannot complete — the reconciliation is off by ${draft.difference.toFixed(2)}. Clear items until the difference is zero.`,
      );
    }

    draft.status = 'completed';
    draft.completedAt = new Date();
    draft.completedBy = new Types.ObjectId(userId) as any;
    await draft.save();
    return draft;
  }

  async list(tenantId: string, accountId?: string) {
    const filter: any = { tenantId: new Types.ObjectId(tenantId) };
    if (accountId && Types.ObjectId.isValid(accountId)) {
      filter.accountId = new Types.ObjectId(accountId);
    }
    return this.reconciliationModel
      .find(filter)
      .sort({ statementDate: -1, createdAt: -1 })
      .populate('accountId', 'code name')
      .populate('completedBy', 'fullName email')
      .lean();
  }

  /** Discard an open draft (completed reconciliations are immutable). */
  async discardDraft(tenantId: string, id: string) {
    const tid = new Types.ObjectId(tenantId);
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid reconciliation id');
    }
    const result = await this.reconciliationModel.deleteOne({
      _id: new Types.ObjectId(id),
      tenantId: tid,
      status: 'in_progress',
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Open reconciliation not found');
    }
    return { discarded: true };
  }
}
