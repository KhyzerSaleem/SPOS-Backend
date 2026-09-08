import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Account, AccountDocument } from './schemas/account.schema';
import { JournalEntry, JournalEntryDocument } from './schemas/journal-entry.schema';
import { Expense, ExpenseDocument } from '../../database/schemas/expense.schema';
import { FinancialPeriod, FinancialPeriodDocument } from './schemas/financial-period.schema';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateFinancialPeriodDto } from './dto/create-financial-period.dto';
import { roundMoney } from '../../common/utils/money.util';
import { CurrencyService } from '../../common/services/currency.service';

type StandardAccountCode =
  | '1000'
  | '1100'
  | '1200'
  | '1300'
  | '2000'
  | '2100'
  | '2200'
  | '4000'
  | '4100'
  | '5000'
  | '5100'
  | '6000';

const STANDARD_ACCOUNTS: Record<
  StandardAccountCode,
  { name: string; type: 'asset' | 'liability' | 'revenue' | 'expense' }
> = {
  '1000': { name: 'Cash and Bank', type: 'asset' },
  '1100': { name: 'Accounts Receivable', type: 'asset' },
  '1200': { name: 'Inventory', type: 'asset' },
  '1300': { name: 'Supplier Credits', type: 'asset' },
  '2000': { name: 'Accounts Payable', type: 'liability' },
  '2100': { name: 'Sales Tax Payable', type: 'liability' },
  '2200': { name: 'Input Tax Recoverable', type: 'asset' },
  '4000': { name: 'Sales Revenue', type: 'revenue' },
  '4100': { name: 'Sales Returns', type: 'revenue' },
  '5000': { name: 'Cost of Goods Sold', type: 'expense' },
  '5100': { name: 'Purchases / Inventory Clearing', type: 'expense' },
  '6000': { name: 'Operating Expenses', type: 'expense' },
};

export interface AutoJournalLineInput {
  accountCode: StandardAccountCode;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface AutoJournalInput {
  tenantId: string;
  storeId: string;
  sourceType: string;
  sourceId: string;
  description: string;
  date?: Date;
  userId?: string;
  lines: AutoJournalLineInput[];
  session?: any;
  sourceCurrency?: string;
  baseCurrency?: string;
  exchangeRate?: number;
  exchangeRateDate?: Date;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel(Account.name)
    private accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name)
    private journalEntryModel: Model<JournalEntryDocument>,
    @InjectModel(Expense.name)
    private expenseModel: Model<ExpenseDocument>,
    @InjectModel(FinancialPeriod.name)
    private financialPeriodModel: Model<FinancialPeriodDocument>,
    @InjectConnection() private connection: Connection,
    private currencyService: CurrencyService,
  ) {}

  async postOperationalJournal(input: AutoJournalInput) {
    const tid = new Types.ObjectId(input.tenantId);
    const sid = new Types.ObjectId(input.storeId);
    const existing = await this.journalEntryModel
      .findOne({
        tenantId: tid,
        storeId: sid,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      })
      .session(input.session ?? null);
    if (existing) return existing;

    const lines: Array<{
      accountId: Types.ObjectId;
      debit: number;
      credit: number;
      description: string;
    }> = [];
    for (const line of input.lines) {
      const debit = roundMoney(line.debit || 0);
      const credit = roundMoney(line.credit || 0);
      if (debit === 0 && credit === 0) continue;
      const account = await this.resolveStandardAccount(
        input.tenantId,
        line.accountCode,
        input.session,
      );
      lines.push({
        accountId: account._id,
        debit,
        credit,
        description: line.description || input.description,
      });
    }

    this.validateJournalBalance(lines);
    const entryNumber = `AUTO-${input.sourceType.toUpperCase()}-${input.sourceId.slice(-8)}`;
    const [entry] = await this.journalEntryModel.create(
      [
        {
          entryNumber,
          date: input.date || new Date(),
          description: input.description,
          lines,
          status: 'posted',
          postedBy: input.userId ? new Types.ObjectId(input.userId) : null,
          postedAt: new Date(),
          reference: `${input.sourceType}:${input.sourceId}`,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          autoPosted: true,
          sourceCurrency: input.sourceCurrency || input.baseCurrency || null,
          baseCurrency: input.baseCurrency || null,
          exchangeRate: input.exchangeRate || 1,
          exchangeRateDate: input.exchangeRateDate || null,
          tenantId: tid,
          storeId: sid,
        },
      ],
      input.session ? { session: input.session } : undefined,
    );

    await this.applyJournalToAccounts(input.tenantId, lines, 1, input.session);
    return entry;
  }

  private async resolveStandardAccount(tenantId: string, code: StandardAccountCode, session?: any) {
    const def = STANDARD_ACCOUNTS[code];
    const tid = new Types.ObjectId(tenantId);
    const account = await this.accountModel.findOneAndUpdate(
      { tenantId: tid, code },
      {
        $setOnInsert: {
          name: def.name,
          code,
          type: def.type,
          description: 'System accounting account',
          isActive: true,
          tenantId: tid,
          balance: 0,
        },
      },
      { upsert: true, new: true, session },
    );
    return account;
  }

  // ─── Accounts ────────────────────────────────────────────────

  async findAllAccounts(tenantId: string) {
    return this.accountModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ code: 1 })
      .lean();
  }

  async createAccount(tenantId: string, dto: CreateAccountDto) {
    const existing = await this.accountModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      code: dto.code,
    });
    if (existing) {
      throw new BadRequestException(`Account with code "${dto.code}" already exists`);
    }

    return this.accountModel.create({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : null,
    });
  }

  async updateAccount(tenantId: string, id: string, dto: UpdateAccountDto) {
    const update: any = { ...dto };
    if (dto.parentId) {
      update.parentId = new Types.ObjectId(dto.parentId);
    }

    const account = await this.accountModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
      update,
      { new: true },
    );
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async deleteAccount(tenantId: string, id: string) {
    const hasChildren = await this.accountModel.exists({
      parentId: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (hasChildren) {
      throw new BadRequestException('Cannot delete account that has child accounts');
    }

    const result = await this.accountModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!result) throw new NotFoundException('Account not found');
    return { message: 'Account deleted successfully' };
  }

  // ─── Journal Entries ─────────────────────────────────────────

  async findAllJournalEntries(tenantId: string, storeId: string, query: any) {
    const { page = 1, limit = 20, status, from, to, dateFrom, dateTo, search } = query;
    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };

    if (status) filter.status = status;

    const resolvedFrom = dateFrom ?? from;
    const resolvedTo = dateTo ?? to;

    if (resolvedFrom || resolvedTo) {
      filter.date = {};
      if (resolvedFrom) filter.date.$gte = new Date(resolvedFrom);
      if (resolvedTo) filter.date.$lte = new Date(resolvedTo);
    }

    if (search) {
      const rx = this.makeSearchRegex(String(search));
      filter.$or = [{ entryNumber: rx }, { description: rx }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.journalEntryModel
        .find(filter)
        .populate({ path: 'lines.accountId', select: 'name code' })
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      this.journalEntryModel.countDocuments(filter),
    ]);

    const dataWithTotals = data.map((e: any) => ({
      ...e,
      totalDebit: Array.isArray(e.lines)
        ? e.lines.reduce((sum: number, l: any) => sum + (l?.debit || 0), 0)
        : 0,
    }));

    return {
      data: dataWithTotals,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    };
  }

  async findJournalEntryById(tenantId: string, storeId: string, id: string) {
    const entry = await this.journalEntryModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .lean();
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  async createJournalEntry(
    tenantId: string,
    storeId: string,
    userId: string,
    dto: CreateJournalEntryDto,
  ) {
    this.validateJournalBalance(dto.lines);

    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const baseCurrency = await this.currencyService.resolveTenantBaseCurrency(tenantId);

    const buildDoc = (entryNumber: string) => ({
      ...dto,
      entryNumber,
      lines: dto.lines.map((l) => ({
        ...l,
        accountId: new Types.ObjectId(l.accountId),
      })),
      sourceCurrency: baseCurrency,
      baseCurrency,
      exchangeRate: 1,
      exchangeRateDate: new Date(dto.date || Date.now()),
      tenantId: tid,
      storeId: sid,
    });

    return this.createWithSequentialNumber(
      this.journalEntryModel,
      { tenantId: tid, storeId: sid },
      'entryNumber',
      'JE',
      buildDoc,
    );
  }

  async postJournalEntry(tenantId: string, storeId: string, id: string, userId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const entry = await this.journalEntryModel.findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      });
      if (!entry) throw new NotFoundException('Journal entry not found');
      if (entry.status !== 'draft') {
        throw new BadRequestException('Only draft entries can be posted');
      }

      await this.applyJournalToAccounts(tenantId, entry.lines, 1, session);

      entry.status = 'posted';
      entry.postedBy = new Types.ObjectId(userId) as any;
      await entry.save({ session });

      await session.commitTransaction();
      return entry;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      void session.endSession();
    }
  }

  async voidJournalEntry(
    tenantId: string,
    storeId: string,
    id: string,
    userId: string,
    voidReason: string,
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const entry = await this.journalEntryModel.findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      });
      if (!entry) throw new NotFoundException('Journal entry not found');
      if (entry.status !== 'posted') {
        throw new BadRequestException('Only posted entries can be voided');
      }

      await this.applyJournalToAccounts(tenantId, entry.lines, -1, session);

      entry.status = 'voided';
      entry.voidedBy = new Types.ObjectId(userId) as any;
      entry.voidReason = voidReason;
      await entry.save({ session });

      await session.commitTransaction();
      return entry;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      void session.endSession();
    }
  }

  private validateJournalBalance(lines: { debit: number; credit: number }[]) {
    const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(
        `Journal entry does not balance: debits (${totalDebit}) != credits (${totalCredit})`,
      );
    }
  }

  private async applyJournalToAccounts(
    tenantId: string,
    lines: any[],
    direction: 1 | -1,
    session: any,
  ) {
    for (const line of lines) {
      const account = await this.accountModel
        .findOne({
          _id: line.accountId,
          tenantId: new Types.ObjectId(tenantId),
        })
        .session(session ?? null);
      if (!account) {
        throw new NotFoundException(`Account ${line.accountId} not found`);
      }

      let balanceChange: number;
      if (account.type === 'asset' || account.type === 'expense') {
        balanceChange = ((line.debit || 0) - (line.credit || 0)) * direction;
      } else {
        balanceChange = ((line.credit || 0) - (line.debit || 0)) * direction;
      }

      await this.accountModel.updateOne(
        { _id: line.accountId, tenantId: new Types.ObjectId(tenantId) },
        { $inc: { balance: balanceChange } },
        { session },
      );
    }
  }

  // ─── Expenses ────────────────────────────────────────────────

  async findAllExpenses(tenantId: string, storeId: string, query: any) {
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      categoryId,
      from,
      to,
      dateFrom,
      dateTo,
      category,
      search,
    } = query;

    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };

    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (categoryId) filter.categoryId = new Types.ObjectId(categoryId);
    if (category) filter.category = String(category);

    const resolvedFrom = dateFrom ?? from;
    const resolvedTo = dateTo ?? to;

    if (resolvedFrom || resolvedTo) {
      filter.date = {};
      if (resolvedFrom) filter.date.$gte = new Date(resolvedFrom);
      if (resolvedTo) filter.date.$lte = new Date(resolvedTo);
    }

    if (search) {
      const rx = this.makeSearchRegex(String(search));
      filter.$or = [{ vendor: rx }, { description: rx }, { expenseNumber: rx }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.expenseModel.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.expenseModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    };
  }

  async createExpense(tenantId: string, storeId: string, userId: string, dto: CreateExpenseDto) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);

    const amount = roundMoney(dto.amount || 0);
    const tax = roundMoney(dto.tax || 0);
    const computedTotal = roundMoney(amount + tax);
    const currencySnapshot = await this.currencyService.resolveSnapshot(
      tenantId,
      storeId,
      dto.date ? new Date(dto.date) : new Date(),
    );

    const buildDoc = (expenseNumber: string) => {
      const createDoc: any = {
        ...dto,
        amount,
        baseAmount: this.currencyService.toBase(amount, currencySnapshot),
        tax,
        baseTax: this.currencyService.toBase(tax, currencySnapshot),
        total: computedTotal,
        currency: currencySnapshot.currency,
        baseCurrency: currencySnapshot.baseCurrency,
        exchangeRate: currencySnapshot.exchangeRate,
        exchangeRateDate: currencySnapshot.exchangeRateDate,
        baseTotal: this.currencyService.toBase(computedTotal, currencySnapshot),
        expenseNumber,
        tenantId: tid,
        storeId: sid,
        createdBy: new Types.ObjectId(userId),
      };
      if (dto.categoryId) createDoc.categoryId = new Types.ObjectId(dto.categoryId);
      return createDoc;
    };

    return this.createWithSequentialNumber(
      this.expenseModel,
      { tenantId: tid, storeId: sid },
      'expenseNumber',
      'EXP',
      buildDoc,
    );
  }

  async updateExpense(tenantId: string, storeId: string, id: string, dto: UpdateExpenseDto) {
    const update: any = { ...dto };
    if (dto.amount !== undefined) update.amount = roundMoney(dto.amount);
    if (dto.tax !== undefined) update.tax = roundMoney(dto.tax);
    if (dto.categoryId) {
      update.categoryId = new Types.ObjectId(dto.categoryId);
    }
    if (dto.amount !== undefined || dto.tax !== undefined || dto.total !== undefined) {
      const current = await this.expenseModel.findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      });
      if (!current) throw new NotFoundException('Expense not found');
      update.total = roundMoney(
        (update.amount ?? current.amount ?? 0) + (update.tax ?? current.tax ?? 0),
      );
      const snapshot = (current as any).exchangeRate
        ? {
            currency: (current as any).currency,
            baseCurrency: (current as any).baseCurrency,
            exchangeRate: Number((current as any).exchangeRate || 1),
            exchangeRateDate: (current as any).exchangeRateDate || current.date || new Date(),
          }
        : await this.currencyService.resolveSnapshot(tenantId, storeId, current.date || new Date());
      update.currency = snapshot.currency;
      update.baseCurrency = snapshot.baseCurrency;
      update.exchangeRate = snapshot.exchangeRate;
      update.exchangeRateDate = snapshot.exchangeRateDate;
      update.baseAmount = this.currencyService.toBase(
        update.amount ?? current.amount ?? 0,
        snapshot,
      );
      update.baseTax = this.currencyService.toBase(update.tax ?? current.tax ?? 0, snapshot);
      update.baseTotal = this.currencyService.toBase(update.total, snapshot);
    }

    const expense = await this.expenseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      update,
      { new: true },
    );
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async deleteExpense(tenantId: string, storeId: string, id: string) {
    const result = await this.expenseModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!result) throw new NotFoundException('Expense not found');
    return { message: 'Expense deleted successfully' };
  }

  async approveExpense(tenantId: string, storeId: string, id: string, userId: string) {
    const expense = await this.expenseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        status: 'pending',
      },
      {
        status: 'approved',
        approvedBy: new Types.ObjectId(userId),
      },
      { new: true },
    );
    if (!expense) {
      throw new NotFoundException('Expense not found or not in pending status');
    }
    if (expense.paymentStatus === 'paid') {
      await this.postOperationalJournal({
        tenantId,
        storeId,
        userId,
        sourceType: 'expense',
        sourceId: expense._id.toString(),
        description: `Expense ${expense.expenseNumber}`,
        date: expense.date,
        lines: [
          {
            accountCode: '6000',
            debit: (expense as any).baseTotal || expense.total,
            description: expense.description || 'Operating expense',
          },
          {
            accountCode: '1000',
            credit: (expense as any).baseTotal || expense.total,
            description: expense.paymentMethod || 'Expense payment',
          },
        ],
        sourceCurrency: (expense as any).currency,
        baseCurrency: (expense as any).baseCurrency,
        exchangeRate: (expense as any).exchangeRate,
        exchangeRateDate: (expense as any).exchangeRateDate,
      });
    }
    return expense;
  }

  async rejectExpense(tenantId: string, storeId: string, id: string) {
    const expense = await this.expenseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        status: 'pending',
      },
      { status: 'rejected' },
      { new: true },
    );
    if (!expense) {
      throw new NotFoundException('Expense not found or not in pending status');
    }
    return expense;
  }

  // ─── Reports ─────────────────────────────────────────────────

  async getProfitLoss(tenantId: string, from: string, to: string) {
    const tid = new Types.ObjectId(tenantId);
    const dateFilter = {
      date: {
        $gte: new Date(from),
        $lte: new Date(to),
      },
    };

    const revenueAccounts = await this.accountModel
      .find({ tenantId: tid, type: 'revenue', isActive: true })
      .lean();
    const expenseAccounts = await this.accountModel
      .find({ tenantId: tid, type: 'expense', isActive: true })
      .lean();

    const revenueIds = revenueAccounts.map((a) => a._id);
    const expenseIds = expenseAccounts.map((a) => a._id);

    const [revenueAgg, expenseAgg] = await Promise.all([
      this.aggregatePostedJournalLines(tid, revenueIds, dateFilter),
      this.aggregatePostedJournalLines(tid, expenseIds, dateFilter),
    ]);

    const totalRevenue = revenueAgg.reduce((sum, a) => sum + (a.totalCredit - a.totalDebit), 0);
    const totalExpenses = expenseAgg.reduce((sum, a) => sum + (a.totalDebit - a.totalCredit), 0);

    return {
      period: { from, to },
      revenue: this.mapReportLines(revenueAccounts, revenueAgg),
      totalRevenue,
      expenses: this.mapReportLines(expenseAccounts, expenseAgg),
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    };
  }

  async getBalanceSheet(tenantId: string, asOf: string) {
    const tid = new Types.ObjectId(tenantId);
    const dateFilter = { date: { $lte: new Date(asOf) } };

    const [assets, liabilities, equity] = await Promise.all([
      this.accountModel.find({ tenantId: tid, type: 'asset', isActive: true }).lean(),
      this.accountModel.find({ tenantId: tid, type: 'liability', isActive: true }).lean(),
      this.accountModel.find({ tenantId: tid, type: 'equity', isActive: true }).lean(),
    ]);

    const allIds = [
      ...assets.map((a) => a._id),
      ...liabilities.map((a) => a._id),
      ...equity.map((a) => a._id),
    ];

    const agg = await this.aggregatePostedJournalLines(tid, allIds, dateFilter);

    const assetLines = this.mapBalanceSheetLines(assets, agg, 'asset');
    const liabilityLines = this.mapBalanceSheetLines(liabilities, agg, 'liability');
    const equityLines = this.mapBalanceSheetLines(equity, agg, 'equity');

    const totalAssets = assetLines.reduce((s, l) => s + l.balance, 0);
    const totalLiabilities = liabilityLines.reduce((s, l) => s + l.balance, 0);
    const totalEquity = equityLines.reduce((s, l) => s + l.balance, 0);

    return {
      asOf,
      assets: assetLines,
      totalAssets,
      liabilities: liabilityLines,
      totalLiabilities,
      equity: equityLines,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
    };
  }

  async getCashFlow(tenantId: string, from: string, to: string) {
    const tid = new Types.ObjectId(tenantId);
    const dateFilter = {
      date: { $gte: new Date(from), $lte: new Date(to) },
    };

    const cashAccounts = await this.accountModel
      .find({
        tenantId: tid,
        type: 'asset',
        isActive: true,
        name: { $regex: /cash|bank/i },
      })
      .lean();

    const cashIds = cashAccounts.map((a) => a._id);
    const agg = await this.aggregatePostedJournalLines(tid, cashIds, dateFilter);

    const lines = this.mapBalanceSheetLines(cashAccounts, agg, 'asset');
    const netCashFlow = lines.reduce((s, l) => s + l.balance, 0);

    return {
      period: { from, to },
      cashAccounts: lines,
      netCashFlow,
    };
  }

  async getTrialBalance(tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    const accounts = await this.accountModel
      .find({ tenantId: tid, isActive: true })
      .sort({ code: 1 })
      .lean();

    const accountIds = accounts.map((a) => a._id);
    const agg = await this.aggregatePostedJournalLines(tid, accountIds, {});

    const lines = accounts.map((account) => {
      const match = agg.find((a) => a._id.toString() === (account._id as any).toString());
      const totalDebit = match ? match.totalDebit : 0;
      const totalCredit = match ? match.totalCredit : 0;

      return {
        accountId: account._id,
        code: account.code,
        name: account.name,
        type: account.type,
        totalDebit,
        totalCredit,
        balance: account.balance,
      };
    });

    const totalDebits = lines.reduce((s, l) => s + l.totalDebit, 0);
    const totalCredits = lines.reduce((s, l) => s + l.totalCredit, 0);

    return {
      accounts: lines,
      totalDebits,
      totalCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
    };
  }

  /**
   * General ledger detail for a single account — the transactions behind any
   * trial-balance / P&L / balance-sheet figure. Lists every posted journal
   * line touching the account in date order with a running balance, plus an
   * opening balance carried in from before the date range.
   *
   * Sign convention matches the report methods above: debit-normal accounts
   * (asset, expense) move up on debits; credit-normal accounts (liability,
   * equity, revenue) move up on credits. Tenant-wide (all stores), posted
   * entries only — consistent with getTrialBalance, the primary drill-down
   * source. Amounts are already in the tenant base currency (journal lines are
   * posted in base), surfaced here for display.
   */
  async getAccountLedger(tenantId: string, accountId: string, from?: string, to?: string) {
    const tid = new Types.ObjectId(tenantId);
    const aid = new Types.ObjectId(accountId);

    const account = await this.accountModel.findOne({ _id: aid, tenantId: tid }).lean();
    if (!account) throw new NotFoundException('Account not found');

    const baseCurrency = await this.currencyService.resolveTenantBaseCurrency(tenantId);
    const debitNormal = account.type === 'asset' || account.type === 'expense';
    const signedDelta = (debit: number, credit: number) =>
      debitNormal ? (debit || 0) - (credit || 0) : (credit || 0) - (debit || 0);

    // Opening balance: net of all posted lines for this account strictly before
    // the range start, so a date-filtered ledger still reconciles to the full
    // account balance.
    let openingBalance = 0;
    if (from) {
      const openingAgg = await this.journalEntryModel.aggregate([
        {
          $match: {
            tenantId: tid,
            status: 'posted',
            date: { $lt: new Date(from) },
            'lines.accountId': aid,
          },
        },
        { $unwind: '$lines' },
        { $match: { 'lines.accountId': aid } },
        {
          $group: {
            _id: null,
            totalDebit: { $sum: '$lines.debit' },
            totalCredit: { $sum: '$lines.credit' },
          },
        },
      ]);
      const o = openingAgg[0];
      if (o) openingBalance = signedDelta(o.totalDebit, o.totalCredit);
    }

    const match: any = { tenantId: tid, status: 'posted', 'lines.accountId': aid };
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }

    const rows = await this.journalEntryModel.aggregate([
      { $match: match },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': aid } },
      { $sort: { date: 1, entryNumber: 1 } },
      {
        $project: {
          entryNumber: 1,
          date: 1,
          description: 1,
          reference: 1,
          sourceType: 1,
          debit: '$lines.debit',
          credit: '$lines.credit',
          lineDescription: '$lines.description',
        },
      },
    ]);

    let running = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;
    const lines = (rows as any[]).map((r) => {
      running += signedDelta(r.debit, r.credit);
      totalDebit += r.debit || 0;
      totalCredit += r.credit || 0;
      return {
        entryId: r._id,
        entryNumber: r.entryNumber,
        date: r.date,
        description: r.lineDescription || r.description || '',
        reference: r.reference || '',
        sourceType: r.sourceType || null,
        debit: r.debit || 0,
        credit: r.credit || 0,
        balance: running,
      };
    });

    return {
      account: { id: account._id, code: account.code, name: account.name, type: account.type },
      baseCurrency,
      debitNormal,
      openingBalance,
      lines,
      closingBalance: running,
      totalDebit,
      totalCredit,
    };
  }

  async getSummary(tenantId: string, storeId: string) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);

    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [revenueAccounts, expenseAccounts, cashAccounts] = await Promise.all([
      this.accountModel.find({ tenantId: tid, type: 'revenue', isActive: true }).lean(),
      this.accountModel.find({ tenantId: tid, type: 'expense', isActive: true }).lean(),
      this.accountModel
        .find({
          tenantId: tid,
          type: 'asset',
          isActive: true,
          name: { $regex: /cash|bank/i },
        })
        .lean(),
    ]);

    const revenueIds = revenueAccounts.map((a) => a._id);
    const expenseIds = expenseAccounts.map((a) => a._id);
    const cashIds = cashAccounts.map((a) => a._id);

    const [curRevAgg, curExpAgg, prevRevAgg, prevExpAgg, cashAgg] = await Promise.all([
      this.aggregatePostedJournalLinesForStore(tid, sid, revenueIds, {
        date: { $gte: currentStart, $lt: nextStart },
      }),
      this.aggregatePostedJournalLinesForStore(tid, sid, expenseIds, {
        date: { $gte: currentStart, $lt: nextStart },
      }),
      this.aggregatePostedJournalLinesForStore(tid, sid, revenueIds, {
        date: { $gte: prevStart, $lt: currentStart },
      }),
      this.aggregatePostedJournalLinesForStore(tid, sid, expenseIds, {
        date: { $gte: prevStart, $lt: currentStart },
      }),
      this.aggregatePostedJournalLinesForStore(tid, sid, cashIds, {
        date: { $lt: nextStart },
      }),
    ]);

    const totalRevenue = curRevAgg.reduce(
      (sum: number, a: any) => sum + (a.totalCredit - a.totalDebit),
      0,
    );
    const totalExpenses = curExpAgg.reduce(
      (sum: number, a: any) => sum + (a.totalDebit - a.totalCredit),
      0,
    );
    const netProfit = totalRevenue - totalExpenses;

    const prevRevenue = prevRevAgg.reduce(
      (sum: number, a: any) => sum + (a.totalCredit - a.totalDebit),
      0,
    );
    const prevExpenses = prevExpAgg.reduce(
      (sum: number, a: any) => sum + (a.totalDebit - a.totalCredit),
      0,
    );
    const prevProfit = prevRevenue - prevExpenses;

    const cashBalance = cashAgg.reduce((sum: number, a: any) => {
      return sum + (a.totalDebit - a.totalCredit);
    }, 0);

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      cashBalance,
      revenueChange: this.calcChangePct(prevRevenue, totalRevenue),
      expensesChange: this.calcChangePct(prevExpenses, totalExpenses),
      profitChange: this.calcChangePct(prevProfit, netProfit),
    };
  }

  async getRevenueExpensesChart(tenantId: string, storeId: string) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [revenueAccounts, expenseAccounts] = await Promise.all([
      this.accountModel.find({ tenantId: tid, type: 'revenue', isActive: true }).lean(),
      this.accountModel.find({ tenantId: tid, type: 'expense', isActive: true }).lean(),
    ]);

    const revenueIds = revenueAccounts.map((a) => a._id);
    const expenseIds = expenseAccounts.map((a) => a._id);

    const agg = await this.journalEntryModel.aggregate([
      {
        $match: {
          tenantId: tid,
          storeId: sid,
          status: 'posted',
          date: { $gte: start, $lt: end },
        },
      },
      { $unwind: '$lines' },
      {
        $match: {
          'lines.accountId': { $in: [...revenueIds, ...expenseIds] },
        },
      },
      {
        $project: {
          ym: { $dateToString: { format: '%Y-%m', date: '$date' } },
          accountId: '$lines.accountId',
          debit: '$lines.debit',
          credit: '$lines.credit',
        },
      },
      {
        $group: {
          _id: { ym: '$ym', accountId: '$accountId' },
          totalDebit: { $sum: '$debit' },
          totalCredit: { $sum: '$credit' },
        },
      },
    ]);

    const months: { ym: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short' });
      months.push({ ym, label });
    }

    const revenueSet = new Set(revenueIds.map((id) => String(id)));
    const expenseSet = new Set(expenseIds.map((id) => String(id)));

    const byMonth = new Map<string, { revenue: number; expenses: number }>();
    for (const m of months) byMonth.set(m.ym, { revenue: 0, expenses: 0 });

    for (const row of agg as any[]) {
      const ym = row?._id?.ym as string;
      const accountId = String(row?._id?.accountId);
      if (!byMonth.has(ym)) continue;

      const debit = row.totalDebit || 0;
      const credit = row.totalCredit || 0;
      const bucket = byMonth.get(ym)!;

      if (revenueSet.has(accountId)) bucket.revenue += credit - debit;
      if (expenseSet.has(accountId)) bucket.expenses += debit - credit;
    }

    return {
      labels: months.map((m) => m.label),
      revenue: months.map((m) => byMonth.get(m.ym)!.revenue),
      expenses: months.map((m) => byMonth.get(m.ym)!.expenses),
    };
  }

  private async aggregatePostedJournalLines(
    tenantId: Types.ObjectId,
    accountIds: any[],
    dateFilter: any,
  ) {
    const matchStage: any = {
      tenantId,
      status: 'posted',
      'lines.accountId': { $in: accountIds },
    };

    if (dateFilter.date) {
      matchStage.date = dateFilter.date;
    }

    return this.journalEntryModel.aggregate([
      { $match: matchStage },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': { $in: accountIds } } },
      {
        $group: {
          _id: '$lines.accountId',
          totalDebit: { $sum: '$lines.debit' },
          totalCredit: { $sum: '$lines.credit' },
        },
      },
    ]);
  }

  private async aggregatePostedJournalLinesForStore(
    tenantId: Types.ObjectId,
    storeId: Types.ObjectId,
    accountIds: any[],
    dateFilter: any,
  ) {
    const matchStage: any = {
      tenantId,
      storeId,
      status: 'posted',
      'lines.accountId': { $in: accountIds },
    };

    if (dateFilter.date) {
      matchStage.date = dateFilter.date;
    }

    return this.journalEntryModel.aggregate([
      { $match: matchStage },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': { $in: accountIds } } },
      {
        $group: {
          _id: '$lines.accountId',
          totalDebit: { $sum: '$lines.debit' },
          totalCredit: { $sum: '$lines.credit' },
        },
      },
    ]);
  }

  private makeSearchRegex(input: string) {
    const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: escaped, $options: 'i' };
  }

  /**
   * Creates a document with a "PREFIX-000001" style sequential number derived
   * from the MAX existing number for that prefix — never countDocuments()+1,
   * which regenerates an already-used number after any deletion and trips the
   * document's unique index (surfacing as the generic "record already exists").
   * Retries on a duplicate-key race so a concurrent create doesn't hard-fail.
   *
   * `prefix` is always an internal constant (e.g. 'JE', 'EXP'), never user
   * input, so the RegExp below carries no injection/ReDoS risk.
   */
  private async createWithSequentialNumber(
    model: Model<any>,
    filter: Record<string, unknown>,
    field: string,
    prefix: string,
    buildDoc: (nextNumber: string) => Record<string, any>,
    pad = 6,
  ): Promise<any> {
    const numberRegex = new RegExp(`^${prefix}-(\\d+)$`);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rows = await model
        .find({ ...filter, [field]: { $regex: `^${prefix}-\\d+$` } })
        .select(field)
        .lean();
      let maxNum = 0;
      for (const row of rows as any[]) {
        const m = String(row[field]).match(numberRegex);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
      const nextNumber = `${prefix}-${String(maxNum + 1).padStart(pad, '0')}`;
      try {
        return await model.create(buildDoc(nextNumber));
      } catch (err: any) {
        const isDupNumber =
          err?.code === 11000 &&
          (err?.keyPattern?.[field] !== undefined || String(err?.message).includes(field));
        if (isDupNumber && attempt < 4) continue;
        throw err;
      }
    }
    throw new BadRequestException('Could not allocate a document number. Please try again.');
  }

  private calcChangePct(previous: number, current: number) {
    if (previous === 0) {
      if (current === 0) return 0;
      return 100;
    }
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  private mapReportLines(accounts: any[], agg: any[]) {
    return accounts.map((account) => {
      const match = agg.find((a) => a._id.toString() === account._id.toString());
      return {
        accountId: account._id,
        code: account.code,
        name: account.name,
        amount: match
          ? account.type === 'revenue'
            ? match.totalCredit - match.totalDebit
            : match.totalDebit - match.totalCredit
          : 0,
      };
    });
  }

  private mapBalanceSheetLines(accounts: any[], agg: any[], type: string) {
    return accounts.map((account) => {
      const match = agg.find((a) => a._id.toString() === account._id.toString());
      let balance = 0;
      if (match) {
        balance =
          type === 'asset'
            ? match.totalDebit - match.totalCredit
            : match.totalCredit - match.totalDebit;
      }
      return {
        accountId: account._id,
        code: account.code,
        name: account.name,
        balance,
      };
    });
  }

  // ─── Financial Periods ───────────────────────────────────────

  async findAllPeriods(tenantId: string) {
    return this.financialPeriodModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ startDate: -1 })
      .lean();
  }

  async createPeriod(tenantId: string, dto: CreateFinancialPeriodDto) {
    return this.financialPeriodModel.create({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  async closePeriod(tenantId: string, id: string) {
    const period = await this.financialPeriodModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        status: 'open',
      },
      { status: 'closed' },
      { new: true },
    );
    if (!period) {
      throw new NotFoundException('Period not found or already closed');
    }
    return period;
  }
}
