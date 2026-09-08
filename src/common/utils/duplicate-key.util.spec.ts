import { duplicateKeyMessage, parseDuplicateKeyError } from './duplicate-key.util';

function dupError(
  keyPattern: Record<string, number>,
  keyValue: Record<string, unknown>,
  indexName = 'idx',
) {
  const err: any = new Error(
    `E11000 duplicate key error collection: db.employees index: ${indexName} dup key: ${JSON.stringify(keyValue)}`,
  );
  err.code = 11000;
  err.keyPattern = keyPattern;
  err.keyValue = keyValue;
  return err;
}

describe('duplicate-key util', () => {
  it('names the conflicting field instead of a generic message', () => {
    const err = dupError(
      { tenantId: 1, email: 1 },
      { tenantId: 'abc', email: 'jo@example.com' },
      'tenantId_1_email_1',
    );
    const msg = duplicateKeyMessage(err);
    expect(msg).toContain('email address');
    expect(msg).toContain('jo@example.com');
  });

  it('hides tenant/store scoping fields from the user-facing message', () => {
    const err = dupError(
      { tenantId: 1, storeId: 1, employeeId: 1 },
      { tenantId: 'abc', storeId: 'def', employeeId: 'EMP-001' },
    );
    const msg = duplicateKeyMessage(err);
    expect(msg).toContain('employee ID');
    expect(msg).toContain('EMP-001');
    expect(msg).not.toContain('tenantId');
    expect(msg).not.toContain('abc');
  });

  it('keeps the bespoke order-number wording', () => {
    const err = dupError({ orderNumber: 1 }, { orderNumber: 'SO-000012' });
    expect(duplicateKeyMessage(err)).toBe(
      'Order number SO-000012 already exists. Please try completing the sale again.',
    );
  });

  it('falls back to the index name when the key is not available', () => {
    const err: any = new Error(
      'E11000 duplicate key error collection: db.employees index: employeeId_1 dup key: {}',
    );
    err.code = 11000;
    const msg = duplicateKeyMessage(err);
    // No keyPattern/keyValue — the index name is the only clue, so surface it.
    expect(msg).toContain('employeeId_1');
  });

  it('exposes the raw key (including tenantId) for server-side logging', () => {
    const err = dupError(
      { tenantId: 1, email: 1 },
      { tenantId: 'abc', email: 'jo@example.com' },
      'tenantId_1_email_1',
    );
    const info = parseDuplicateKeyError(err);
    expect(info.indexName).toBe('tenantId_1_email_1');
    expect(info.fields).toEqual(['email']);
    expect(info.rawKey).toEqual({ tenantId: 'abc', email: 'jo@example.com' });
  });

  it('reads multi-field conflicts', () => {
    const err = dupError(
      { tenantId: 1, sku: 1, barcode: 1 },
      { tenantId: 'a', sku: 'SKU1', barcode: 'B1' },
    );
    const msg = duplicateKeyMessage(err);
    expect(msg).toContain('SKU');
    expect(msg).toContain('barcode');
  });
});
