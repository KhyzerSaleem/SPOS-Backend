import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';

/**
 * Coverage for the reconciliation math: cleared balance = opening + Σ(signed
 * cleared lines), difference = statement − cleared, and completion is gated on
 * a zero difference. Signed amount for a bank (asset) account is debit − credit.
 */
describe('BankReconciliationService', () => {
  const tenantId = new Types.ObjectId().toString();
  const accountId = new Types.ObjectId().toString();

  // Three posted lines hitting the bank account.
  const e1 = new Types.ObjectId();
  const l1 = new Types.ObjectId();
  const e2 = new Types.ObjectId();
  const l2 = new Types.ObjectId();
  const e3 = new Types.ObjectId();
  const l3 = new Types.ObjectId();

  const ledgerRows = [
    {
      _id: e1,
      lineId: l1,
      entryNumber: 'JE-000001',
      date: new Date('2026-01-05'),
      debit: 100,
      credit: 0,
    },
    {
      _id: e2,
      lineId: l2,
      entryNumber: 'JE-000002',
      date: new Date('2026-01-06'),
      debit: 0,
      credit: 40,
    },
    {
      _id: e3,
      lineId: l3,
      entryNumber: 'JE-000003',
      date: new Date('2026-01-07'),
      debit: 25,
      credit: 0,
    },
  ];

  function makeService({ completed = [], findOneAndUpdate, completeDraft }: any) {
    const accountModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: accountId,
          code: '1000',
          name: 'Cash and Bank',
          type: 'asset',
        }),
      }),
    };
    const journalEntryModel = {
      aggregate: jest.fn().mockResolvedValue(ledgerRows),
    };
    const reconciliationModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(completed),
      }),
      findOne: completeDraft
        ? jest.fn().mockResolvedValue(completeDraft)
        : jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      findOneAndUpdate:
        findOneAndUpdate || jest.fn((_f, update) => Promise.resolve({ ...update.$set })),
    };
    const currencyService = { resolveTenantBaseCurrency: jest.fn().mockResolvedValue('USD') };
    const service = new BankReconciliationService(
      accountModel as any,
      journalEntryModel as any,
      reconciliationModel as any,
      currencyService as any,
    );
    return { service, reconciliationModel };
  }

  it('cleared balance = Σ(debit − credit) of ticked lines; difference vs statement', async () => {
    let captured: any;
    const findOneAndUpdate = jest.fn((_f, update) => {
      captured = update.$set;
      return Promise.resolve({ ...update.$set });
    });
    const { service } = makeService({ findOneAndUpdate });

    await service.save(tenantId, new Types.ObjectId().toString(), {
      accountId,
      statementDate: '2026-01-31',
      statementEndingBalance: 60,
      // Clear +100 and −40 → cleared 60, matches statement exactly.
      clearedItems: [
        { entryId: e1.toString(), lineId: l1.toString() },
        { entryId: e2.toString(), lineId: l2.toString() },
      ],
    } as any);

    expect(captured.clearedItems).toHaveLength(2);
    expect(captured.clearedBalance).toBe(60);
    expect(captured.difference).toBe(0);
  });

  it('drops cleared items that are not real outstanding lines', async () => {
    let captured: any;
    const findOneAndUpdate = jest.fn((_f, update) => {
      captured = update.$set;
      return Promise.resolve({ ...update.$set });
    });
    const { service } = makeService({ findOneAndUpdate });

    await service.save(tenantId, new Types.ObjectId().toString(), {
      accountId,
      statementDate: '2026-01-31',
      statementEndingBalance: 100,
      clearedItems: [
        { entryId: e1.toString(), lineId: l1.toString() }, // valid (+100)
        { entryId: new Types.ObjectId().toString(), lineId: new Types.ObjectId().toString() }, // bogus
      ],
    } as any);

    expect(captured.clearedItems).toHaveLength(1);
    expect(captured.clearedBalance).toBe(100);
    expect(captured.difference).toBe(0);
  });

  it('carries the opening balance from a prior completed reconciliation', async () => {
    let captured: any;
    const findOneAndUpdate = jest.fn((_f, update) => {
      captured = update.$set;
      return Promise.resolve({ ...update.$set });
    });
    // e1/l1 already reconciled previously; cleared balance then was 100.
    const completed = [
      {
        clearedItems: [{ entryId: e1, lineId: l1 }],
        clearedBalance: 100,
        statementDate: new Date('2025-12-31'),
      },
    ];
    const { service } = makeService({ findOneAndUpdate, completed });

    await service.save(tenantId, new Types.ObjectId().toString(), {
      accountId,
      statementDate: '2026-01-31',
      statementEndingBalance: 85,
      // Try to clear the already-reconciled e1 (dropped) plus e3 (+25).
      clearedItems: [
        { entryId: e1.toString(), lineId: l1.toString() },
        { entryId: e3.toString(), lineId: l3.toString() },
      ],
    } as any);

    // opening 100 + newly cleared 25 = 125; only e3 survives.
    expect(captured.clearedItems).toHaveLength(1);
    expect(captured.clearedBalance).toBe(125);
    expect(captured.difference).toBe(-40); // 85 − 125
  });

  it('refuses to complete a reconciliation that is not balanced', async () => {
    const completeDraft = { difference: 12.5, status: 'in_progress', save: jest.fn() };
    const { service } = makeService({ completeDraft });
    await expect(
      service.complete(tenantId, new Types.ObjectId().toString(), new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(completeDraft.save).not.toHaveBeenCalled();
  });

  it('completes a balanced reconciliation and stamps it', async () => {
    const completeDraft: any = {
      difference: 0,
      status: 'in_progress',
      save: jest.fn().mockResolvedValue(true),
    };
    const { service } = makeService({ completeDraft });
    const userId = new Types.ObjectId().toString();
    await service.complete(tenantId, new Types.ObjectId().toString(), userId);
    expect(completeDraft.status).toBe('completed');
    expect(completeDraft.completedAt).toBeInstanceOf(Date);
    expect(completeDraft.save).toHaveBeenCalled();
  });
});
