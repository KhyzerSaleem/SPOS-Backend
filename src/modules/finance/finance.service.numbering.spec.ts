import { Types } from 'mongoose';
import { FinanceService } from './finance.service';

function findChain(rows: any[]) {
  return { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(rows) };
}

/**
 * Coverage for the sequential-number generator behind createJournalEntry /
 * createExpense. The bug this replaces: countDocuments()+1 regenerates an
 * already-used number after any deletion, tripping the (tenant, store, number)
 * unique index and surfacing as "record already exists".
 */
describe('FinanceService — sequential document numbers', () => {
  const tenantId = new Types.ObjectId().toString();
  const storeId = new Types.ObjectId().toString();

  function makeService({ existingNumbers = [], createImpl }: any) {
    const journalEntryModel = {
      find: jest
        .fn()
        .mockReturnValue(findChain(existingNumbers.map((n: string) => ({ entryNumber: n })))),
      create: createImpl || jest.fn((doc: any) => Promise.resolve({ _id: 'je1', ...doc })),
    };
    const currencyService = { resolveTenantBaseCurrency: jest.fn().mockResolvedValue('USD') };
    const service = new FinanceService(
      {} as any,
      journalEntryModel as any,
      {} as any,
      {} as any,
      {} as any,
      currencyService as any,
    );
    return { service, journalEntryModel };
  }

  const balancedDto = () => ({
    date: '2026-03-01',
    description: 'Test entry',
    lines: [
      { accountId: new Types.ObjectId().toString(), debit: 100, credit: 0 },
      { accountId: new Types.ObjectId().toString(), debit: 0, credit: 100 },
    ],
  });

  it('generates JE-000001 for the first entry', async () => {
    const { service, journalEntryModel } = makeService({ existingNumbers: [] });
    await service.createJournalEntry(tenantId, storeId, 'user1', balancedDto() as any);
    expect(journalEntryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ entryNumber: 'JE-000001' }),
    );
  });

  it('uses max existing + 1, not count + 1 (so a gap from a deletion cannot collide)', async () => {
    // 2 rows exist but the highest number is 7 — count+1 would have produced
    // JE-000003 (an already-used number); max+1 correctly produces JE-000008.
    const { service, journalEntryModel } = makeService({
      existingNumbers: ['JE-000007', 'JE-000002'],
    });
    await service.createJournalEntry(tenantId, storeId, 'user1', balancedDto() as any);
    expect(journalEntryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ entryNumber: 'JE-000008' }),
    );
  });

  it('retries with a fresh number on a duplicate-key race, then succeeds', async () => {
    let calls = 0;
    const createImpl = jest.fn(() => {
      calls += 1;
      if (calls === 1) {
        const err: any = new Error('E11000 duplicate key');
        err.code = 11000;
        err.keyPattern = { entryNumber: 1 };
        return Promise.reject(err);
      }
      return Promise.resolve({ _id: 'je1' });
    });
    const { service, journalEntryModel } = makeService({
      existingNumbers: ['JE-000001'],
      createImpl,
    });

    await service.createJournalEntry(tenantId, storeId, 'user1', balancedDto() as any);

    // First attempt collided, second attempt (still JE-000002 here since the
    // mocked find returns the same rows) succeeded — the point is it retried
    // rather than throwing the raw 11000.
    expect(journalEntryModel.create).toHaveBeenCalledTimes(2);
  });

  it('rejects an unbalanced entry before touching numbering', async () => {
    const { service, journalEntryModel } = makeService({ existingNumbers: [] });
    const bad = { ...balancedDto(), lines: [{ accountId: 'a', debit: 100, credit: 0 }] };
    await expect(
      service.createJournalEntry(tenantId, storeId, 'user1', bad as any),
    ).rejects.toThrow(/balance/);
    expect(journalEntryModel.create).not.toHaveBeenCalled();
  });
});
