/**
 * Turns a MongoDB E11000 duplicate-key error into something a human can act on.
 *
 * The previous handling collapsed every 11000 into "This record already exists",
 * which hid *which* index actually collided — making duplicate-key bugs
 * effectively undiagnosable in production. These helpers pull the offending
 * field(s) out of the driver error so the API response names them and the server
 * log records the full key.
 */

/** Scoping columns are an implementation detail — never name them to the user. */
const INTERNAL_FIELDS = new Set(['tenantId', 'storeId', '_id']);

const FIELD_LABELS: Record<string, string> = {
  employeeId: 'employee ID',
  email: 'email address',
  orderNumber: 'order number',
  invoiceNumber: 'invoice number',
  entryNumber: 'entry number',
  expenseNumber: 'expense number',
  sku: 'SKU',
  barcode: 'barcode',
  code: 'code',
  slug: 'name',
  name: 'name',
  phone: 'phone number',
  subdomain: 'subdomain',
  taxNumber: 'tax number',
  batchNumber: 'batch number',
};

function humanize(field: string): string {
  return (
    FIELD_LABELS[field] ||
    field
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

export interface DuplicateKeyInfo {
  /** Index name reported by MongoDB, e.g. "tenantId_1_email_1". */
  indexName: string | null;
  /** Colliding fields, minus tenant/store scoping. */
  fields: string[];
  /** Colliding field → value, minus tenant/store scoping. */
  values: Record<string, unknown>;
  /** Full key including scoping fields — for server-side logging only. */
  rawKey: Record<string, unknown>;
}

export function parseDuplicateKeyError(err: unknown): DuplicateKeyInfo {
  const e = (err ?? {}) as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    message?: string;
  };

  const rawKey = e.keyValue ?? {};
  const patternFields = Object.keys(e.keyPattern ?? {});
  const valueFields = Object.keys(rawKey);
  const allFields = patternFields.length ? patternFields : valueFields;

  const fields = allFields.filter((f) => !INTERNAL_FIELDS.has(f));
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in rawKey) values[f] = rawKey[f];
  }

  // Fall back to scraping the index name out of the driver message when
  // keyPattern/keyValue aren't populated (older drivers / some error paths).
  let indexName: string | null = null;
  const match = /index:\s*([^\s]+)/.exec(String(e.message ?? ''));
  if (match) indexName = match[1];

  return { indexName, fields, values, rawKey };
}

/** User-facing message that names the conflicting field(s) where possible. */
export function duplicateKeyMessage(err: unknown): string {
  const { fields, values, indexName } = parseDuplicateKeyError(err);

  // Sales keep their bespoke, action-oriented wording.
  if (fields.includes('orderNumber')) {
    const value = values.orderNumber;
    return value
      ? `Order number ${value} already exists. Please try completing the sale again.`
      : 'Order number already exists. Please try completing the sale again.';
  }

  if (fields.length === 0) {
    return indexName
      ? `This record already exists (conflicting index: ${indexName}). Please refresh and try again.`
      : 'This record already exists. Please refresh and try again.';
  }

  const labels = fields.map(humanize);
  const label =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

  const shown = fields
    .map((f) => values[f])
    .filter((v) => v !== undefined && v !== null && String(v).length > 0);

  const suffix = shown.length ? ` (${shown.join(', ')})` : '';
  return `A record with this ${label}${suffix} already exists.`;
}
