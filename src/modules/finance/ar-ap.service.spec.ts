import { Types } from 'mongoose';
import { ArApService } from './ar-ap.service';

function lean(value: any) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('ArApService', () => {
  const tenantId = new Types.ObjectId().toString();
  const customerId = new Types.ObjectId().toString();
  const supplierId = new Types.ObjectId().toString();
  const asOf = new Date('2026-03-01T00:00:00.000Z');

  function makeService({ sales = [], invoices = [], customers = [], suppliers = [] }: any = {}) {
    const saleOrderModel = { find: jest.fn().mockReturnValue(lean(sales)) };
    const supplierInvoiceModel = { find: jest.fn().mockReturnValue(lean(invoices)) };
    const customerModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(customers),
      }),
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(customers[0] || null),
      }),
    };
    const supplierModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(suppliers),
      }),
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(suppliers[0] || null),
      }),
    };
    const currencyService = { resolveTenantBaseCurrency: jest.fn().mockResolvedValue('USD') };
    const service = new ArApService(
      saleOrderModel as any,
      supplierInvoiceModel as any,
      customerModel as any,
      supplierModel as any,
      currencyService as any,
    );
    return { service };
  }

  describe('getReceivablesAging', () => {
    it('buckets an unpaid same-currency sale by days overdue and reports the customer name', async () => {
      const { service } = makeService({
        sales: [
          {
            customerId,
            totalAmount: 500,
            baseTotalAmount: 500,
            currency: 'USD',
            baseCurrency: 'USD',
            exchangeRateMissing: false,
            payments: [],
            date: new Date('2026-01-01'),
            paymentDueDate: new Date('2026-01-15'), // 45 days before asOf -> 31-60 bucket
          },
        ],
        customers: [{ _id: customerId, name: 'Acme Retail' }],
      });

      const result = await service.getReceivablesAging(tenantId, asOf);

      expect(result.baseCurrency).toBe('USD');
      expect(result.excludedCount).toBe(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ name: 'Acme Retail', total: 500 });
      expect(result.rows[0].buckets['31-60']).toBe(500);
      expect(result.totals.grandTotal).toBe(500);
    });

    it('nets partial payments off the outstanding balance', async () => {
      const { service } = makeService({
        sales: [
          {
            customerId,
            totalAmount: 500,
            baseTotalAmount: 500,
            currency: 'USD',
            baseCurrency: 'USD',
            payments: [{ amount: 200, baseAmount: 200 }],
            date: asOf,
            paymentDueDate: asOf,
          },
        ],
        customers: [{ _id: customerId, name: 'Acme Retail' }],
      });

      const result = await service.getReceivablesAging(tenantId, asOf);
      expect(result.totals.grandTotal).toBe(300);
    });

    it('excludes a cross-currency sale with a missing FX rate from totals, but surfaces the count', async () => {
      const { service } = makeService({
        sales: [
          {
            customerId,
            totalAmount: 100000,
            baseTotalAmount: 0,
            currency: 'PKR',
            baseCurrency: 'USD',
            exchangeRateMissing: true,
            payments: [],
            date: asOf,
            paymentDueDate: asOf,
          },
        ],
        customers: [{ _id: customerId, name: 'Lahore Branch Customer' }],
      });

      const result = await service.getReceivablesAging(tenantId, asOf);
      // Must never show 100000 as if it were USD.
      expect(result.totals.grandTotal).toBe(0);
      expect(result.excludedCount).toBe(1);
      expect(result.excludedNote).toMatch(/pending an FX rate/);
    });

    it('skips a sale that is already fully paid', async () => {
      const { service } = makeService({
        sales: [
          {
            customerId,
            totalAmount: 500,
            baseTotalAmount: 500,
            currency: 'USD',
            baseCurrency: 'USD',
            payments: [{ amount: 500, baseAmount: 500 }],
            date: asOf,
            paymentDueDate: asOf,
          },
        ],
        customers: [{ _id: customerId, name: 'Acme Retail' }],
      });

      const result = await service.getReceivablesAging(tenantId, asOf);
      expect(result.rows).toHaveLength(0);
      expect(result.totals.grandTotal).toBe(0);
    });
  });

  describe('getPayablesAging', () => {
    it('buckets an unpaid supplier invoice using its precomputed base balance due', async () => {
      const { service } = makeService({
        invoices: [
          {
            supplierId,
            totalAmount: 5000,
            baseTotalAmount: 5000,
            balanceDue: 5000,
            baseBalanceDue: 5000,
            currency: 'USD',
            baseCurrency: 'USD',
            invoiceDate: new Date('2025-11-01'),
            dueDate: new Date('2025-11-01'), // well over 90 days before asOf
          },
        ],
        suppliers: [{ _id: supplierId, name: 'Global Supplies Co' }],
      });

      const result = await service.getPayablesAging(tenantId, asOf);
      expect(result.rows[0]).toMatchObject({ name: 'Global Supplies Co', total: 5000 });
      expect(result.rows[0].buckets['90+']).toBe(5000);
    });
  });

  describe('getCustomerStatement', () => {
    it('computes a running balance across sale and return lines', async () => {
      const { service } = makeService({
        sales: [
          {
            orderNumber: 'S-1',
            totalAmount: 500,
            baseTotalAmount: 500,
            currency: 'USD',
            baseCurrency: 'USD',
            payments: [],
            date: new Date('2026-01-01'),
            type: 'sale',
          },
          {
            orderNumber: 'S-2',
            totalAmount: -100,
            baseTotalAmount: -100,
            currency: 'USD',
            baseCurrency: 'USD',
            payments: [],
            date: new Date('2026-01-05'),
            type: 'return',
          },
        ],
        customers: [{ _id: customerId, name: 'Acme Retail', email: 'a@acme.test', phone: '123' }],
      });

      const result = await service.getCustomerStatement(tenantId, customerId);
      expect(result.customer.name).toBe('Acme Retail');
      expect(result.lines.map((l: any) => l.balance)).toEqual([500, 400]);
      expect(result.closingBalance).toBe(400);
    });
  });
});
