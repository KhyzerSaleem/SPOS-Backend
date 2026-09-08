import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ImportJobDocument = ImportJob & Document;

export const IMPORT_ENTITY_TYPES = [
  'products',
  'customers',
  'categories',
  'inventory',
  'suppliers',
  'warehouses',
  'stock_movements',
  'sales',
  'sale_returns',
  'purchases',
  'purchase_returns',
  'supplier_invoices',
  'supplier_payments',
  'expenses',
  'accounts',
  'opening_balances',
  'exchange_rates',
] as const;

export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];
export type ImportDuplicateStrategy = 'skip' | 'update' | 'restore';
export type ImportJobStatus = 'draft' | 'preview' | 'running' | 'completed' | 'failed';

@Schema({ _id: false })
export class ImportRowError {
  @Prop({ required: true })
  row: number;

  @Prop({ required: true })
  message: string;
}

@Schema({ _id: false })
export class ImportJobStats {
  @Prop({ default: 0 })
  total: number;

  @Prop({ default: 0 })
  created: number;

  @Prop({ default: 0 })
  updated: number;

  @Prop({ default: 0 })
  restored: number;

  @Prop({ default: 0 })
  skipped: number;

  @Prop({ default: 0 })
  failed: number;
}

@Schema({ collection: 'import_jobs', timestamps: true })
export class ImportJob {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, enum: IMPORT_ENTITY_TYPES })
  entityType: ImportEntityType;

  @Prop({ default: 'csv', enum: ['csv', 'json', 'xlsx'] })
  format: 'csv' | 'json' | 'xlsx';

  @Prop({ default: 'skip', enum: ['skip', 'update', 'restore'] })
  duplicateStrategy: ImportDuplicateStrategy;

  @Prop({ type: Object, default: {} })
  columnMapping: Record<string, string>;

  @Prop({ default: 'draft', enum: ['draft', 'preview', 'running', 'completed', 'failed'] })
  status: ImportJobStatus;

  @Prop({ type: [Object], default: [] })
  rows: Record<string, string>[];

  @Prop({ type: [Object], default: [] })
  previewSample: Record<string, unknown>[];

  @Prop({ type: [ImportRowError], default: [] })
  rowErrors: ImportRowError[];

  @Prop({ type: ImportJobStats, default: () => ({}) })
  stats: ImportJobStats;

  @Prop({ default: 0 })
  progress: number;

  @Prop({ default: 0, min: 0 })
  processedRows: number;

  @Prop({ type: Date, default: null })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  completedAt: Date;

  @Prop({ default: '' })
  fileName: string;
}

export const ImportJobSchema = SchemaFactory.createForClass(ImportJob);
ImportJobSchema.index({ tenantId: 1, storeId: 1, createdAt: -1 });
