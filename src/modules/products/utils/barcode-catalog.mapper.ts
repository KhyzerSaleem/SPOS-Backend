/**
 * Maps external barcode catalog fields → SwiftPOS Product schema fields.
 */

export type CatalogProvider = 'local' | 'openfoodfacts' | 'upcitemdb' | 'manual';

export interface MappedProductDraft {
  name: string;
  description: string;
  barcode: string;
  sku: string;
  brandHint: string;
  categoryHint: string;
  images: string[];
  price: number | null;
  costPrice: number | null;
}

export interface FieldCoverage {
  name: boolean;
  description: boolean;
  barcode: boolean;
  sku: boolean;
  brandHint: boolean;
  categoryHint: boolean;
  images: boolean;
  price: boolean;
  categoryId: boolean;
  brandId: boolean;
}

export interface CatalogLookupResult {
  found: boolean;
  barcode: string;
  source: CatalogProvider;
  sourcesTried: CatalogProvider[];
  mapped: MappedProductDraft;
  coverage: FieldCoverage;
  missingRequired: string[];
  missingOptional: string[];
  message: string;
}

export function buildCoverage(mapped: MappedProductDraft): FieldCoverage {
  return {
    name: !!mapped.name?.trim(),
    description: !!mapped.description?.trim(),
    barcode: !!mapped.barcode?.trim(),
    sku: !!mapped.sku?.trim(),
    brandHint: !!mapped.brandHint?.trim(),
    categoryHint: !!mapped.categoryHint?.trim(),
    images: (mapped.images?.length ?? 0) > 0,
    price: mapped.price != null && mapped.price >= 0,
    categoryId: false,
    brandId: false,
  };
}

export function listMissingFields(mapped: MappedProductDraft, coverage: FieldCoverage) {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  if (!coverage.name) missingRequired.push('name');
  if (!coverage.sku) missingRequired.push('sku');
  if (!coverage.price) missingRequired.push('price');

  if (!coverage.description) missingOptional.push('description');
  if (!coverage.brandHint) missingOptional.push('brand');
  if (!coverage.categoryHint) missingOptional.push('category');
  if (!coverage.images) missingOptional.push('image');
  if (!coverage.categoryId) missingOptional.push('categoryId');
  if (!coverage.brandId) missingOptional.push('brandId');

  return { missingRequired, missingOptional };
}

export function emptyDraft(barcode: string): MappedProductDraft {
  const trimmed = (barcode || '').trim();
  return {
    name: '',
    description: '',
    barcode: trimmed,
    sku: trimmed ? `BC-${trimmed.slice(-8)}` : '',
    brandHint: '',
    categoryHint: '',
    images: [],
    price: null,
    costPrice: null,
  };
}

export function mapOpenFoodFacts(
  barcode: string,
  product: Record<string, unknown>,
): MappedProductDraft {
  const p = product || {};
  const name =
    pickString(p.product_name) ||
    pickString(p.product_name_en) ||
    pickString(p.generic_name) ||
    pickString(p.abbreviated_product_name) ||
    '';

  const brand = pickString(p.brands)?.split(',')[0]?.trim() || pickString(p.brand_owner) || '';
  const description =
    pickString(p.ingredients_text) || pickString(p.categories)?.split(',')[0]?.trim() || '';
  const categoryHint = pickString(p.categories) || pickString(p.main_category) || '';
  const image =
    pickString(p.image_front_url) ||
    pickString(p.image_url) ||
    pickString(p.image_front_small_url) ||
    '';

  return {
    name: name.trim(),
    description: description.trim().slice(0, 500),
    barcode: barcode.trim(),
    sku: `BC-${barcode.trim().slice(-8)}`,
    brandHint: brand,
    categoryHint: categoryHint.split(',')[0]?.trim() || '',
    images: image ? [image] : [],
    price: null,
    costPrice: null,
  };
}

export function mapUpcItemDb(barcode: string, item: Record<string, unknown>): MappedProductDraft {
  const title = pickString(item.title) || pickString(item.description) || '';
  const brand = pickString(item.brand) || '';
  const description = pickString(item.description) || '';
  const categoryHint = pickString(item.category) || '';
  const images = Array.isArray(item.images)
    ? item.images.filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
    : [];

  return {
    name: title.trim().slice(0, 200),
    description: description.trim().slice(0, 500),
    barcode: barcode.trim(),
    sku: pickString(item.ean) || pickString(item.upc) || `BC-${barcode.trim().slice(-8)}`,
    brandHint: brand,
    categoryHint,
    images: images.slice(0, 3),
    price: null,
    costPrice: null,
  };
}

function pickString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function finalizeCatalogResult(
  barcode: string,
  source: CatalogProvider,
  sourcesTried: CatalogProvider[],
  mapped: MappedProductDraft,
): CatalogLookupResult {
  const coverage = buildCoverage(mapped);
  const { missingRequired, missingOptional } = listMissingFields(mapped, coverage);
  const found = coverage.name || coverage.description || coverage.brandHint;

  let message = 'Barcode not found in external catalogs — enter details manually.';
  if (found && missingRequired.includes('price')) {
    message = `Loaded from ${source}. Set selling price and category before saving.`;
  } else if (found) {
    message = `Loaded from ${source}. Review mapped fields before saving.`;
  }

  return {
    found,
    barcode: barcode.trim(),
    source,
    sourcesTried,
    mapped,
    coverage,
    missingRequired,
    missingOptional,
    message,
  };
}

export const CATALOG_FIELD_MAP_DOC = [
  {
    ourField: 'name',
    openFoodFacts: 'product_name / generic_name',
    upcItemDb: 'title',
    required: true,
  },
  {
    ourField: 'sku',
    openFoodFacts: 'auto: BC-{last8}',
    upcItemDb: 'ean / upc / auto',
    required: true,
  },
  {
    ourField: 'barcode',
    openFoodFacts: 'scanned code',
    upcItemDb: 'scanned code',
    required: false,
  },
  {
    ourField: 'description',
    openFoodFacts: 'ingredients_text',
    upcItemDb: 'description',
    required: false,
  },
  {
    ourField: 'brandId',
    openFoodFacts: 'brands → match Brands',
    upcItemDb: 'brand → match',
    required: false,
  },
  {
    ourField: 'categoryId',
    openFoodFacts: 'categories → match Categories',
    upcItemDb: 'category → match',
    required: false,
  },
  {
    ourField: 'price',
    openFoodFacts: 'you enter (not in catalog)',
    upcItemDb: 'you enter (not in catalog)',
    required: true,
  },
  { ourField: 'images', openFoodFacts: 'image_front_url', upcItemDb: 'images[]', required: false },
];
