import {
  calculateCartTotals,
  calculatePaymentSummary,
  calculatePurchaseTotals,
  roundMoney,
} from './money.util';

describe('money.util', () => {
  it('rounds using minor-unit conversion instead of raw floating point drift', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(10.005)).toBe(10.01);
  });

  it('calculates sale cart totals with discounts and tax exactly to cents', () => {
    const totals = calculateCartTotals({
      items: [
        { price: 19.99, quantity: 2, discount: 1 },
        { price: 4.255, quantity: 3 },
      ],
      globalDiscount: 10,
      discountType: 'percent',
      taxRate: 7.5,
    });

    expect(totals).toEqual({
      subtotal: 51.76,
      discountAmount: 5.18,
      taxableBase: 46.58,
      taxAmount: 3.49,
      grandTotal: 50.07,
    });
  });

  it('derives payment status, balance, and change from rounded totals', () => {
    expect(calculatePaymentSummary(50.06, [{ amount: 20 }, { amount: 30.06 }])).toMatchObject({
      totalPaid: 50.06,
      balanceDue: 0,
      changeDue: 0,
      paymentStatus: 'paid',
    });

    expect(calculatePaymentSummary(50.06, [{ amount: 60 }])).toMatchObject({
      totalPaid: 60,
      balanceDue: 0,
      changeDue: 9.94,
      paymentStatus: 'paid',
    });
  });

  it('calculates purchase totals with tax, discount, and shipping', () => {
    expect(
      calculatePurchaseTotals({
        items: [
          { quantity: 2, unitCost: 10.255, taxPercent: 5 },
          { quantity: 3, unitCost: 4.1, taxPercent: 0 },
        ],
        discount: 1.25,
        shipping: 2.5,
      }),
    ).toEqual({
      subtotal: 32.82,
      taxTotal: 1.03,
      discount: 1.25,
      shipping: 2.5,
      totalAmount: 35.1,
    });
  });
});
