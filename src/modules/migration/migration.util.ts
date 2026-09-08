import * as ExcelJS from 'exceljs';

export type ImportEntityType =
  | 'products'
  | 'customers'
  | 'categories'
  | 'inventory'
  | 'suppliers'
  | 'warehouses'
  | 'stock_movements'
  | 'sales'
  | 'sale_returns'
  | 'purchases'
  | 'purchase_returns'
  | 'supplier_invoices'
  | 'supplier_payments'
  | 'expenses'
  | 'accounts'
  | 'opening_balances'
  | 'exchange_rates';

export const DEFAULT_COLUMN_MAPPINGS: Record<ImportEntityType, Record<string, string[]>> = {
  products: {
    name: ['name', 'product_name', 'product name', 'title'],
    sku: ['sku', 'product_sku', 'code', 'item_code'],
    price: ['price', 'sell_price', 'retail_price', 'unit_price'],
    costPrice: ['cost', 'cost_price', 'costprice', 'purchase_price'],
    stock: ['stock', 'quantity', 'qty', 'on_hand', 'inventory'],
    barcode: ['barcode', 'upc', 'ean', 'bar_code'],
    category: ['category', 'category_name', 'department'],
    description: ['description', 'desc', 'details'],
    isActive: ['active', 'is_active', 'status'],
  },
  customers: {
    name: ['name', 'customer_name', 'full_name', 'customer'],
    email: ['email', 'email_address', 'e-mail'],
    phone: ['phone', 'mobile', 'telephone', 'phone_number'],
    address: ['address', 'street', 'billing_address'],
    loyaltyPoints: ['loyalty_points', 'points', 'loyalty'],
    notes: ['notes', 'note', 'comments'],
  },
  categories: {
    name: ['name', 'category', 'category_name', 'department'],
    slug: ['slug', 'code', 'category_code'],
  },
  inventory: {
    sku: ['sku', 'product_sku', 'code', 'item_code'],
    stock: ['stock', 'quantity', 'qty', 'on_hand', 'inventory'],
    reorderPoint: ['reorder_point', 'reorder', 'min_stock', 'minimum_stock'],
  },
  suppliers: {
    name: ['name', 'supplier_name', 'vendor', 'vendor_name'],
    email: ['email', 'email_address'],
    phone: ['phone', 'mobile', 'telephone'],
    contact: ['contact', 'contact_person'],
    address: ['address', 'supplier_address'],
    payableBalance: ['payable_balance', 'balance_due', 'ap_balance'],
    creditBalance: ['credit_balance', 'supplier_credit'],
  },
  warehouses: {
    name: ['name', 'warehouse', 'warehouse_name'],
    code: ['code', 'warehouse_code'],
    address: ['address', 'location'],
  },
  stock_movements: {
    sku: ['sku', 'product_sku', 'item_code'],
    warehouseCode: ['warehouse_code', 'warehouse', 'location'],
    type: ['type', 'movement_type'],
    quantity: ['quantity', 'qty'],
    reason: ['reason', 'note'],
    date: ['date', 'movement_date'],
  },
  sales: {
    orderNumber: ['order_number', 'invoice_number', 'sale_no', 'receipt_no'],
    date: ['date', 'sale_date', 'created_at'],
    customer: ['customer', 'customer_name', 'customer_email', 'customer_phone'],
    items: ['items', 'line_items'],
    subtotal: ['subtotal'],
    tax: ['tax', 'tax_total'],
    discount: ['discount'],
    totalAmount: ['total', 'total_amount', 'grand_total'],
    paidAmount: ['paid', 'paid_amount', 'payment'],
    paymentMethod: ['payment_method', 'method'],
    currency: ['currency'],
    exchangeRate: ['exchange_rate', 'rate'],
  },
  sale_returns: {
    orderNumber: ['return_number', 'order_number', 'credit_note'],
    returnRef: ['original_order', 'sale_order', 'return_ref'],
    date: ['date', 'return_date'],
    reason: ['reason'],
    totalAmount: ['total', 'refund_total', 'total_amount'],
  },
  purchases: {
    poNumber: ['po_number', 'purchase_order', 'order_number'],
    supplier: ['supplier', 'supplier_name', 'vendor'],
    warehouseCode: ['warehouse_code', 'warehouse'],
    date: ['date', 'created_at'],
    items: ['items', 'line_items'],
    subtotal: ['subtotal'],
    taxTotal: ['tax', 'tax_total'],
    discount: ['discount'],
    shipping: ['shipping'],
    totalAmount: ['total', 'total_amount'],
    status: ['status'],
  },
  purchase_returns: {
    returnNumber: ['return_number', 'purchase_return', 'credit_note'],
    poNumber: ['po_number', 'purchase_order'],
    supplier: ['supplier', 'supplier_name'],
    date: ['date', 'return_date'],
    totalAmount: ['total', 'total_amount'],
    reason: ['reason'],
  },
  supplier_invoices: {
    invoiceNumber: ['invoice_number', 'bill_number'],
    poNumber: ['po_number', 'purchase_order'],
    supplier: ['supplier', 'supplier_name'],
    invoiceDate: ['invoice_date', 'date'],
    dueDate: ['due_date'],
    totalAmount: ['total', 'amount', 'total_amount'],
    paidAmount: ['paid', 'paid_amount'],
  },
  supplier_payments: {
    invoiceNumber: ['invoice_number', 'bill_number'],
    amount: ['amount', 'paid_amount', 'payment'],
    method: ['method', 'payment_method'],
    reference: ['reference', 'transaction_id'],
    paidAt: ['paid_at', 'date'],
  },
  expenses: {
    expenseNumber: ['expense_number', 'reference'],
    date: ['date', 'expense_date'],
    category: ['category', 'account'],
    amount: ['amount'],
    tax: ['tax'],
    total: ['total'],
    paymentStatus: ['payment_status', 'status'],
    vendor: ['vendor', 'supplier'],
    description: ['description', 'note'],
  },
  accounts: {
    code: ['code', 'account_code'],
    name: ['name', 'account_name'],
    type: ['type', 'account_type'],
    balance: ['balance', 'opening_balance'],
  },
  opening_balances: {
    accountCode: ['account_code', 'code'],
    debit: ['debit'],
    credit: ['credit'],
    date: ['date'],
    description: ['description', 'note'],
  },
  exchange_rates: {
    fromCurrency: ['from', 'from_currency', 'currency'],
    toCurrency: ['to', 'to_currency', 'base_currency'],
    rate: ['rate', 'exchange_rate'],
    effectiveAt: ['effective_at', 'date'],
    note: ['note', 'source'],
  },
};

/** Parse a single CSV line respecting quoted fields. */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsv(content: string): Record<string, string>[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.every((v) => !v)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

export function parseJsonRows(content: string): Record<string, string>[] {
  const parsed = JSON.parse(content);
  const arr = Array.isArray(parsed) ? parsed : (parsed?.data ?? parsed?.rows ?? []);
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    const row: Record<string, string> = {};
    Object.entries(item as Record<string, unknown>).forEach(([k, v]) => {
      row[normalizeHeader(k)] = v == null ? '' : String(v);
    });
    return row;
  });
}

export async function parseXlsxRows(content: string): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(content, 'base64');
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) return [];
  const headers = (worksheet.getRow(1).values as unknown[])
    .slice(1)
    .map((value) => normalizeHeader(String(value ?? '')));
  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const out: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const cell = row.getCell(idx + 1);
      const value = cell.text || String(cell.value ?? '');
      if (value.trim()) hasValue = true;
      out[header] = value;
    });
    if (hasValue) rows.push(out);
  });
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

export function autoDetectMapping(
  entityType: ImportEntityType,
  headers: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const defs = DEFAULT_COLUMN_MAPPINGS[entityType];

  for (const [field, aliases] of Object.entries(defs)) {
    const match = headers.find((h) => aliases.includes(h));
    if (match) mapping[field] = match;
  }
  return mapping;
}

export function mapRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [field, sourceCol] of Object.entries(mapping)) {
    if (sourceCol && row[sourceCol] !== undefined) {
      mapped[field] = row[sourceCol];
    }
  }
  return mapped;
}

export function parseNumber(value: string | undefined, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function parseBoolean(value: string | undefined, fallback = true): boolean {
  if (value == null || value === '') return fallback;
  const v = value.toLowerCase();
  if (['false', '0', 'no', 'inactive', 'disabled'].includes(v)) return false;
  if (['true', '1', 'yes', 'active', 'enabled'].includes(v)) return true;
  return fallback;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
