import { safeBaseAmount, agingBucketForDays, daysOverdue } from './currency-rollup.util';

describe('safeBaseAmount', () => {
  it('uses the local amount directly when currency matches base', () => {
    const result = safeBaseAmount(1000, 999, { currency: 'USD', baseCurrency: 'USD' });
    expect(result).toEqual({ amount: 1000, excluded: false });
  });

  it('uses the local amount directly for legacy records with no currency set', () => {
    const result = safeBaseAmount(500, 0, { currency: null, baseCurrency: null });
    expect(result).toEqual({ amount: 500, excluded: false });
  });

  it('excludes (never coerces) a record flagged exchangeRateMissing', () => {
    const result = safeBaseAmount(100000, 0, {
      currency: 'PKR',
      baseCurrency: 'USD',
      exchangeRateMissing: true,
    });
    // Must NOT return 100000 (that would be treating PKR as USD) or any other
    // guessed value — 0 and excluded:true, so the caller surfaces this
    // separately instead of silently corrupting the consolidated total.
    expect(result).toEqual({ amount: 0, excluded: true });
  });

  it('uses the precomputed base amount for a properly converted cross-currency record', () => {
    const result = safeBaseAmount(100000, 359.4, {
      currency: 'PKR',
      baseCurrency: 'USD',
      exchangeRateMissing: false,
    });
    expect(result).toEqual({ amount: 359.4, excluded: false });
  });
});

describe('agingBucketForDays', () => {
  it.each([
    [-5, 'current'],
    [0, 'current'],
    [1, '1-30'],
    [30, '1-30'],
    [31, '31-60'],
    [60, '31-60'],
    [61, '61-90'],
    [90, '61-90'],
    [91, '90+'],
    [365, '90+'],
  ])('classifies %i days overdue as %s', (days, bucket) => {
    expect(agingBucketForDays(days)).toBe(bucket);
  });
});

describe('daysOverdue', () => {
  it('returns a positive number when the due date is in the past', () => {
    const due = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date('2026-01-15T00:00:00.000Z');
    expect(daysOverdue(due, asOf)).toBe(14);
  });

  it('returns a non-positive number when the due date has not arrived yet', () => {
    const due = new Date('2026-02-01T00:00:00.000Z');
    const asOf = new Date('2026-01-15T00:00:00.000Z');
    expect(daysOverdue(due, asOf)).toBe(-17);
  });
});
