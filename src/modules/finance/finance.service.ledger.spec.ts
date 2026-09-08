import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FinanceService } from './finance.service';

/**
 * Focused coverage for getAccountLedger — the general-ledger drill-down. The
 * accuracy-critical parts are the debit/credit sign convention per account
 * type and the running-balance math, so those are what's asserted here.
 */
describe('FinanceService.getAccountLedger', () => {
  const tenantId = new Types.ObjectId().toString();
  const accountId = new Types.ObjectId().toString();

  function makeService({ account, ledgerRows = [], openingRows = [] }: any) {
    const accountModel = {
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(account) }),
    };
    const journalEntryModel = {
      // When `from` is supplied the service calls aggregate twice: first the
      // opening-balance aggregation, then the in-range rows.
      aggregate: jest.fn(),
    };
    const currencyService = { resolveTenantBaseCurrency: jest.fn().mockResolvedValue('USD') };

    const service = new FinanceService(
      accountModel as any,
      journalEntryModel as any,
      {} as any,
      {} as any,
      {} as any,
      currencyService as any,
    );
    return { service, accountModel, journalEntryModel, openingRows, ledgerRows };
  }

  it('throws NotFoundException when the account does not belong to the tenant', async () => {
    const { service } = makeService({ account: null });
    await expect(service.getAccountLedger(tenantId, accountId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('runs a debit-normal (asset) balance up on debits and down on credits', async () => {
    const { service, journalEntryModel } = makeService({
      account: { _id: accountId, code: '1000', name: 'Cash', type: 'asset' },
      ledgerRows: [
        { _id: 'e1', entryNumber: 'JE-1', date: new Date('2026-01-01'), debit: 100, credit: 0 },
        { _id: 'e2', entryNumber: 'JE-2', date: new Date('2026-01-02'), debit: 0, credit: 40 },
        { _id: 'e3', entryNumber: 'JE-3', date: new Date('2026-01-03'), debit: 25, credit: 0 },
      ],
    });
    journalEntryModel.aggregate.mockResolvedValueOnce([
      { _id: 'e1', entryNumber: 'JE-1', date: new Date('2026-01-01'), debit: 100, credit: 0 },
      { _id: 'e2', entryNumber: 'JE-2', date: new Date('2026-01-02'), debit: 0, credit: 40 },
      { _id: 'e3', entryNumber: 'JE-3', date: new Date('2026-01-03'), debit: 25, credit: 0 },
    ]);

    const result = await service.getAccountLedger(tenantId, accountId);

    expect(result.debitNormal).toBe(true);
    expect(result.openingBalance).toBe(0);
    expect(result.lines.map((l: any) => l.balance)).toEqual([100, 60, 85]);
    expect(result.closingBalance).toBe(85);
    expect(result.totalDebit).toBe(125);
    expect(result.totalCredit).toBe(40);
  });

  it('runs a credit-normal (revenue) balance up on credits', async () => {
    const { service, journalEntryModel } = makeService({
      account: { _id: accountId, code: '4000', name: 'Sales', type: 'revenue' },
    });
    journalEntryModel.aggregate.mockResolvedValueOnce([
      { _id: 'e1', entryNumber: 'JE-1', date: new Date('2026-01-01'), debit: 0, credit: 200 },
      { _id: 'e2', entryNumber: 'JE-2', date: new Date('2026-01-02'), debit: 30, credit: 0 }, // a refund/return
    ]);

    const result = await service.getAccountLedger(tenantId, accountId);

    expect(result.debitNormal).toBe(false);
    expect(result.lines.map((l: any) => l.balance)).toEqual([200, 170]);
    expect(result.closingBalance).toBe(170);
  });

  it('carries an opening balance from before the range start', async () => {
    const { service, journalEntryModel } = makeService({
      account: { _id: accountId, code: '1000', name: 'Cash', type: 'asset' },
    });
    // First call = opening aggregation (net 500 debit − 100 credit = 400 for an asset).
    journalEntryModel.aggregate
      .mockResolvedValueOnce([{ _id: null, totalDebit: 500, totalCredit: 100 }])
      .mockResolvedValueOnce([
        { _id: 'e9', entryNumber: 'JE-9', date: new Date('2026-02-05'), debit: 0, credit: 150 },
      ]);

    const result = await service.getAccountLedger(tenantId, accountId, '2026-02-01', '2026-02-28');

    expect(result.openingBalance).toBe(400);
    // 400 opening, then a 150 credit on an asset → 250.
    expect(result.lines[0].balance).toBe(250);
    expect(result.closingBalance).toBe(250);
    expect(journalEntryModel.aggregate).toHaveBeenCalledTimes(2);
  });

  it('does not run an opening-balance query when no from-date is given', async () => {
    const { service, journalEntryModel } = makeService({
      account: { _id: accountId, code: '1000', name: 'Cash', type: 'asset' },
    });
    journalEntryModel.aggregate.mockResolvedValueOnce([]);

    const result = await service.getAccountLedger(tenantId, accountId);

    expect(result.openingBalance).toBe(0);
    expect(journalEntryModel.aggregate).toHaveBeenCalledTimes(1);
  });
});
