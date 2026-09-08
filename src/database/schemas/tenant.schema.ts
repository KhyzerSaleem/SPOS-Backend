import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type TenantDocument = Tenant & Document;

// Available feature modules
export const FEATURE_MODULES = [
  'pos',
  'products',
  'inventory',
  'sales',
  'purchases',
  'customers',
  'suppliers',
  'hrm',
  'finance',
  'reports',
  'settings',
  'billing',
  'api',
] as const;

export type FeatureModule = (typeof FEATURE_MODULES)[number];

@Schema({ timestamps: true })
export class Tenant {
  @ApiProperty({ description: 'Business/tenant name' })
  @Prop({ required: true })
  name: string;

  @ApiProperty({ description: 'Unique subdomain for tenant' })
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  subdomain: string;

  @ApiProperty({ enum: ['trial', 'basic', 'pro', 'enterprise', 'suspended', 'cancelled'] })
  @Prop({
    type: String,
    enum: ['trial', 'basic', 'pro', 'enterprise', 'suspended', 'cancelled'],
    default: 'trial',
  })
  plan: string;

  @ApiProperty({ description: 'Whether tenant account is active' })
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @ApiProperty({ description: 'Tenant reporting/base currency for consolidated accounting' })
  @Prop({ type: String, uppercase: true, trim: true, default: null })
  baseCurrency: string;

  @ApiProperty({ description: 'How the tenant base currency was selected' })
  @Prop({
    type: String,
    enum: ['owner_country', 'manual', 'store', 'legacy'],
    default: 'owner_country',
  })
  baseCurrencySource: string;

  @ApiProperty({
    description: 'Modules synced from plan tier. Do not set manually — use plan field.',
  })
  @Prop({ type: [String], enum: FEATURE_MODULES, default: [] })
  featureAccess: FeatureModule[];

  @ApiProperty({ description: 'Subscription start date' })
  @Prop({ type: Date, default: Date.now })
  subscriptionStartDate: Date;

  @ApiProperty({ description: 'Subscription end date (null = never expires)' })
  @Prop({ type: Date, default: null })
  subscriptionEndDate: Date;

  @ApiProperty({ description: 'Maximum number of users allowed' })
  @Prop({ type: Number, default: 5 })
  maxUsers: number;

  @ApiProperty({ description: 'Maximum number of stores allowed' })
  @Prop({ type: Number, default: 1 })
  maxStores: number;

  @ApiProperty({ description: 'Maximum storage in MB' })
  @Prop({ type: Number, default: 100 })
  maxStorageMB: number;

  @ApiProperty({ description: 'Tenant settings (logo, theme, etc.)' })
  @Prop({ type: Object, default: {} })
  settings: {
    logo?: string;
    systemName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    primaryColor?: string;
    darkMode?: boolean;
    timezone?: string;
    dateFormat?: string;
    currency?: string;
    defaultLocale?: string;
    onboardingCompleted?: boolean;
    industry?: string;
    posMode?: string;
    uiMode?: 'simple' | 'advanced';
    catalogMode?: 'per_store' | 'central';
  };

  @ApiProperty({ description: 'Feature overrides (enable/disable specific features)' })
  @Prop({ type: Object, default: {} })
  featureOverrides: Record<string, boolean>;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);

// Indexes for efficient queries
TenantSchema.index({ isActive: 1 });
TenantSchema.index({ plan: 1 });
TenantSchema.index({ createdAt: -1 });
TenantSchema.index({ subscriptionEndDate: 1 });
TenantSchema.index({ baseCurrency: 1 });
