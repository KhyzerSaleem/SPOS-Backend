export interface StarterTemplate {
  categories: string[];
  brands?: string[];
  units: { name: string; abbreviation: string }[];
  posDefaults: {
    paymentMethods: string[];
    defaultTaxRate: number;
    receiptFooter: string;
    requireShift?: boolean | null;
    loyaltyEarnRate?: number;
    loyaltyRedeemRate?: number;
  };
  sampleProducts: {
    name: string;
    sku: string;
    price: number;
    category: string;
  }[];
}

export const DEFAULT_STARTER_TEMPLATE: StarterTemplate = {
  categories: ['General', 'Electronics', 'Home & Garden', 'Accessories', 'Clearance'],
  units: [
    { name: 'Piece', abbreviation: 'pcs' },
    { name: 'Box', abbreviation: 'box' },
    { name: 'Pack', abbreviation: 'pack' },
  ],
  posDefaults: {
    paymentMethods: ['cash', 'card', 'mobile'],
    defaultTaxRate: 0,
    receiptFooter: 'Thank you for shopping with us!',
    requireShift: null,
    loyaltyEarnRate: 0.01,
    loyaltyRedeemRate: 100,
  },
  sampleProducts: [
    { name: 'Wireless Earbuds', sku: 'DEMO-WE-001', price: 29.99, category: 'Electronics' },
  ],
};
