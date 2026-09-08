/** POS / sales money math — keep in sync with src/lib/pos-calculations.js */

export function roundMoney(amount: number, decimalPlaces = 2): number {
  return fromMinorUnits(toMinorUnits(amount, decimalPlaces), decimalPlaces);
}

export function toMinorUnits(amount: number, decimalPlaces = 2): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimalPlaces;
  return Math.round((n + Number.EPSILON) * factor);
}

export function fromMinorUnits(minorUnits: number, decimalPlaces = 2): number {
  const factor = 10 ** decimalPlaces;
  return Number((minorUnits / factor).toFixed(decimalPlaces));
}

export function normalizeQuantity(quantity: number, decimalPlaces = 3): number {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Quantity must be greater than zero');
  }
  const factor = 10 ** decimalPlaces;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function clampMoney(amount: number, min = 0, decimalPlaces = 2): number {
  return roundMoney(Math.max(min, Number(amount) || 0), decimalPlaces);
}

export interface CartLineInput {
  price: number;
  quantity: number;
  discount?: number;
}

export interface CartTotalsInput {
  items: CartLineInput[];
  globalDiscount?: number;
  discountType?: 'percent' | 'flat';
  taxRate?: number;
  decimalPlaces?: number;
}

export interface CartTotalsResult {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxableBase: number;
  grandTotal: number;
}

export function calculateCartTotals(input: CartTotalsInput): CartTotalsResult {
  const dp = input.decimalPlaces ?? 2;
  const subtotalMinor = input.items.reduce((sum, i) => {
    const quantity = normalizeQuantity(i.quantity);
    const gross = toMinorUnits(i.price, dp) * quantity;
    const discount = toMinorUnits(i.discount || 0, dp);
    return sum + Math.max(0, Math.round(gross) - discount);
  }, 0);
  const subtotal = fromMinorUnits(subtotalMinor, dp);

  const rawDiscount = Math.max(0, input.globalDiscount || 0);
  let discountAmount =
    input.discountType === 'percent'
      ? roundMoney((subtotal * Math.min(rawDiscount, 100)) / 100, dp)
      : roundMoney(rawDiscount, dp);
  discountAmount = Math.min(discountAmount, subtotal);

  const taxableBase = roundMoney(Math.max(0, subtotal - discountAmount), dp);
  const taxAmount = roundMoney(
    (taxableBase * Math.max(0, Math.min(input.taxRate || 0, 100))) / 100,
    dp,
  );
  const grandTotal = roundMoney(taxableBase + taxAmount, dp);

  return { subtotal, discountAmount, taxAmount, taxableBase, grandTotal };
}

export interface PaymentInput {
  amount: number;
}

export function calculatePaymentSummary(
  totalAmount: number,
  payments: PaymentInput[] = [],
  decimalPlaces = 2,
): {
  totalPaid: number;
  balanceDue: number;
  changeDue: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
} {
  const totalMinor = Math.max(0, toMinorUnits(totalAmount, decimalPlaces));
  const paidMinor = payments.reduce(
    (sum, p) => sum + Math.max(0, toMinorUnits(p.amount, decimalPlaces)),
    0,
  );
  const balanceMinor = Math.max(0, totalMinor - paidMinor);
  const changeMinor = Math.max(0, paidMinor - totalMinor);
  const paymentStatus = paidMinor >= totalMinor ? 'paid' : paidMinor > 0 ? 'partial' : 'unpaid';

  return {
    totalPaid: fromMinorUnits(paidMinor, decimalPlaces),
    balanceDue: fromMinorUnits(balanceMinor, decimalPlaces),
    changeDue: fromMinorUnits(changeMinor, decimalPlaces),
    paymentStatus,
  };
}

export interface PurchaseLineInput {
  quantity: number;
  unitCost: number;
  taxPercent?: number;
}

export interface PurchaseTotalsInput {
  items: PurchaseLineInput[];
  discount?: number;
  shipping?: number;
  decimalPlaces?: number;
}

export function calculatePurchaseTotals(input: PurchaseTotalsInput): {
  subtotal: number;
  taxTotal: number;
  discount: number;
  shipping: number;
  totalAmount: number;
} {
  const dp = input.decimalPlaces ?? 2;
  const subtotalMinor = input.items.reduce((sum, item) => {
    const quantity = normalizeQuantity(item.quantity);
    return sum + Math.round(toMinorUnits(item.unitCost, dp) * quantity);
  }, 0);

  const taxMinor = input.items.reduce((sum, item) => {
    const quantity = normalizeQuantity(item.quantity);
    const lineMinor = Math.round(toMinorUnits(item.unitCost, dp) * quantity);
    const taxRate = Math.max(0, Math.min(Number(item.taxPercent) || 0, 100));
    return sum + Math.round((lineMinor * taxRate) / 100);
  }, 0);

  const discountMinor = Math.min(
    toMinorUnits(clampMoney(input.discount || 0, 0, dp), dp),
    subtotalMinor + taxMinor,
  );
  const shippingMinor = toMinorUnits(clampMoney(input.shipping || 0, 0, dp), dp);
  const totalMinor = Math.max(0, subtotalMinor + taxMinor - discountMinor + shippingMinor);

  return {
    subtotal: fromMinorUnits(subtotalMinor, dp),
    taxTotal: fromMinorUnits(taxMinor, dp),
    discount: fromMinorUnits(discountMinor, dp),
    shipping: fromMinorUnits(shippingMinor, dp),
    totalAmount: fromMinorUnits(totalMinor, dp),
  };
}

/** Reject client totals that drift from server recomputation. */
export function assertTotalsMatch(
  computed: CartTotalsResult,
  clientDiscount: number,
  clientTax: number,
  tolerance = 0,
): void {
  if (Math.abs(computed.discountAmount - (clientDiscount || 0)) > tolerance) {
    throw new Error('Order discount does not match line items');
  }
  if (Math.abs(computed.taxAmount - (clientTax || 0)) > tolerance) {
    throw new Error('Order tax does not match taxable amount');
  }
}
