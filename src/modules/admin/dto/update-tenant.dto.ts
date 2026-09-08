import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// Available feature modules (must match tenant.schema.ts)
const FEATURE_MODULES = [
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

type FeatureModule = (typeof FEATURE_MODULES)[number];

export class UpdateTenantDto {
  @ApiProperty({ description: 'Business/tenant name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Unique subdomain for tenant', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'subdomain must be lowercase alphanumeric with dashes' })
  subdomain?: string;

  @ApiProperty({ description: 'Subscription plan name (matches Plans catalog)', required: false })
  @IsOptional()
  @IsString()
  @IsIn(['trial', 'basic', 'pro', 'enterprise'])
  plan?: string;

  @ApiProperty({ description: 'Whether tenant account is active', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Modules this tenant can access. Empty = all modules enabled.',
    enum: FEATURE_MODULES,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  featureAccess?: FeatureModule[];

  @ApiProperty({ description: 'Subscription end date', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  subscriptionEndDate?: Date;

  @ApiProperty({ description: 'Maximum number of users allowed', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxUsers?: number;

  @ApiProperty({ description: 'Maximum number of stores allowed', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxStores?: number;

  @ApiProperty({ description: 'Maximum storage in MB', required: false })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(10000)
  maxStorageMB?: number;

  @ApiProperty({ description: 'Tenant settings (logo, theme, etc.)', required: false })
  @IsOptional()
  @IsObject()
  settings?: {
    logo?: string;
    primaryColor?: string;
    darkMode?: boolean;
    timezone?: string;
    dateFormat?: string;
    currency?: string;
  };

  @ApiProperty({ description: 'Feature overrides', required: false })
  @IsOptional()
  @IsObject()
  featureOverrides?: Record<string, boolean>;
}

// For bulk operations on multiple tenants
export class BulkUpdateTenantsDto {
  @ApiProperty({ description: 'Array of tenant IDs to update' })
  @IsArray()
  @IsString({ each: true })
  tenantIds: string[];

  @ApiProperty({ description: 'Updates to apply to all selected tenants' })
  updates: UpdateTenantDto;
}

// For pausing/suspending a tenant
export class SuspendTenantDto {
  @ApiProperty({ description: 'Whether to suspend the tenant' })
  @IsBoolean()
  suspended: boolean;

  @ApiProperty({ description: 'Reason for suspension', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
