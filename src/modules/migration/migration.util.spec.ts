import { autoDetectMapping, parseCsv, parseCsvLine, parseNumber, slugify } from './migration.util';

describe('migration.util', () => {
  it('parses CSV with quoted commas', () => {
    expect(parseCsvLine('"Hello, World",10')).toEqual(['Hello, World', '10']);
  });

  it('parses CSV rows with headers', () => {
    const rows = parseCsv('name,sku,price\nWidget A,SKU-1,9.99\nWidget B,SKU-2,12');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Widget A', sku: 'SKU-1', price: '9.99' });
  });

  it('auto-detects product column mapping', () => {
    const mapping = autoDetectMapping('products', ['product_name', 'sku', 'retail_price']);
    expect(mapping.name).toBe('product_name');
    expect(mapping.sku).toBe('sku');
    expect(mapping.price).toBe('retail_price');
  });

  it('slugifies names', () => {
    expect(slugify('Fresh Milk 1L')).toBe('fresh-milk-1l');
  });

  it('parses currency numbers', () => {
    expect(parseNumber('$12.50')).toBe(12.5);
  });
});
