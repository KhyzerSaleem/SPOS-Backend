import { BadRequestException } from '@nestjs/common';
import { CurrencyService } from './currency.service';

function lean(value: any) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function sortedLean(value: any) {
  return { sort: jest.fn().mockReturnValue(lean(value)) };
}

function query(value: any) {
  return {
    lean: jest.fn().mockResolvedValue(value),
    sort: jest.fn().mockReturnValue(lean(value)),
  };
}

describe('CurrencyService', () => {
  function makeService({
    tenant = { _id: 'tenant1', baseCurrency: 'PKR', settings: {} },
    store = { _id: 'store1', currency: 'GBP' },
    rate = { rate: 280, effectiveAt: new Date('2026-01-01T00:00:00.000Z') },
  }: { tenant?: any; store?: any; rate?: any } = {}) {
    const tenantModel = {
      findById: jest.fn().mockReturnValue(lean(tenant)),
    };
    const storeModel = {
      findOne: jest.fn().mockReturnValue(query(store)),
    };
    const exchangeRateModel = {
      findOne: jest.fn().mockReturnValue(sortedLean(rate)),
    };
    return {
      service: new CurrencyService(tenantModel as any, storeModel as any, exchangeRateModel as any),
      tenantModel,
      storeModel,
      exchangeRateModel,
    };
  }

  it('uses exchange rate 1 when store and base currency match', async () => {
    const { service, exchangeRateModel } = makeService({
      tenant: { _id: 'tenant1', baseCurrency: 'PKR', settings: {} },
      store: { _id: 'store1', currency: 'PKR' },
    });

    const snapshot = await service.resolveSnapshot(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012',
    );

    expect(snapshot).toMatchObject({ currency: 'PKR', baseCurrency: 'PKR', exchangeRate: 1 });
    expect(exchangeRateModel.findOne).not.toHaveBeenCalled();
  });

  it('returns the latest manual rate for cross-currency stores', async () => {
    const { service } = makeService();

    const snapshot = await service.resolveSnapshot(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012',
      new Date('2026-01-02T00:00:00.000Z'),
    );

    expect(snapshot).toMatchObject({
      currency: 'GBP',
      baseCurrency: 'PKR',
      exchangeRate: 280,
    });
    expect(service.toBase(300, snapshot)).toBe(84000);
  });

  it('blocks cross-currency transactions when no manual rate exists', async () => {
    const { service } = makeService({ rate: null });

    await expect(
      service.resolveSnapshot('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows cross-currency transactions with a flagged snapshot when allowMissing is set', async () => {
    const { service } = makeService({ rate: null });

    const snapshot = await service.resolveSnapshot(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012',
      new Date(),
      { allowMissing: true },
    );

    expect(snapshot).toMatchObject({
      currency: 'GBP',
      baseCurrency: 'PKR',
      exchangeRateMissing: true,
      exchangeRate: 0,
    });
    // A missing rate must never coerce to a raw/rate-1 base amount — it yields 0,
    // and the exchangeRateMissing flag marks the record for exclusion + backfill.
    expect(service.toBase(300, snapshot)).toBe(0);
  });

  it('converts to 0 for a flagged (missing-rate) snapshot and a real amount otherwise', () => {
    const { service } = makeService();
    expect(service.toBase(100, { exchangeRate: 2, exchangeRateMissing: false })).toBe(200);
    expect(service.toBase(100, { exchangeRate: 0, exchangeRateMissing: true })).toBe(0);
  });
});
