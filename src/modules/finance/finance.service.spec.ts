import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FinanceService } from './finance.service';

function chain(value: any) {
  return { session: jest.fn().mockResolvedValue(value) };
}

describe('FinanceService auto journals', () => {
  const tenantId = new Types.ObjectId().toString();
  const storeId = new Types.ObjectId().toString();

  function makeService(existing: any = null) {
    const account = { _id: new Types.ObjectId(), type: 'asset' };
    const findOneSession = jest.fn().mockResolvedValue(account);
    const accountModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue(account),
      findOne: jest.fn().mockReturnValue({ session: findOneSession }),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    const journalEntryModel = {
      findOne: jest.fn().mockReturnValue(chain(existing)),
      create: jest
        .fn()
        .mockResolvedValue([{ _id: new Types.ObjectId(), entryNumber: 'AUTO-TEST-12345678' }]),
    };
    const service = new FinanceService(
      accountModel as any,
      journalEntryModel as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveTenantBaseCurrency: jest.fn().mockResolvedValue('USD') } as any,
    );
    return { service, accountModel, journalEntryModel, findOneSession };
  }

  it('returns an existing source journal instead of double-posting', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      sourceType: 'supplier_invoice',
      sourceId: 'source-1',
    };
    const { service, journalEntryModel } = makeService(existing);

    const result = await service.postOperationalJournal({
      tenantId,
      storeId,
      sourceType: 'supplier_invoice',
      sourceId: 'source-1',
      description: 'Existing AP journal',
      lines: [
        { accountCode: '5100', debit: 100 },
        { accountCode: '2000', credit: 100 },
      ],
    });

    expect(result).toBe(existing);
    expect(journalEntryModel.create).not.toHaveBeenCalled();
  });

  it('requires balanced auto-posted journals', async () => {
    const { service, journalEntryModel } = makeService();

    await expect(
      service.postOperationalJournal({
        tenantId,
        storeId,
        sourceType: 'expense',
        sourceId: 'source-2',
        description: 'Broken expense journal',
        lines: [
          { accountCode: '6000', debit: 50 },
          { accountCode: '1000', credit: 49.99 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(journalEntryModel.create).not.toHaveBeenCalled();
  });

  it('uses the transaction session when applying auto-posted account balances', async () => {
    const session = { id: 'txn-session' };
    const { service, accountModel, journalEntryModel, findOneSession } = makeService();

    await service.postOperationalJournal({
      tenantId,
      storeId,
      sourceType: 'sale',
      sourceId: 'source-3',
      description: 'POS sale journal',
      lines: [
        { accountCode: '1000', debit: 100 },
        { accountCode: '4000', credit: 100 },
      ],
      session,
    });

    expect(journalEntryModel.create).toHaveBeenCalled();
    expect(accountModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ session }),
    );
    expect(findOneSession).toHaveBeenCalledWith(session);
    expect(accountModel.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ session }),
    );
  });
});
