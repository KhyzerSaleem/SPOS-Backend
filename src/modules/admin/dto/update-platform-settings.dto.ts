import { IsArray, IsBoolean, IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsString()
  maintenanceMessage?: string;

  @IsOptional()
  @IsString()
  maintenanceEstimate?: string;

  @IsOptional()
  @IsDateString()
  maintenanceScheduledStart?: string | null;

  @IsOptional()
  @IsDateString()
  maintenanceScheduledEnd?: string | null;

  @IsOptional()
  @IsString()
  maintenanceTimezone?: string;

  @IsOptional()
  @IsBoolean()
  maintenanceAutoEnable?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenanceShowNotice?: boolean;

  @IsOptional()
  @IsString()
  maintenanceApologyMessage?: string;

  @IsOptional()
  @IsString()
  maintenanceNoticeMessage?: string;

  @IsOptional()
  @IsObject()
  marketingBanner?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  seo?: Record<string, unknown>;

  /** Per-page SEO overrides keyed by page slug (home, features, pricing, ...). */
  @IsOptional()
  @IsObject()
  pageSeo?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  platformMatrix?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  productionMetrics?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  bentoFeatures?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  solutions?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  contactHighlights?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  trustLogos?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  preFooterCta?: Record<string, unknown>;
}
