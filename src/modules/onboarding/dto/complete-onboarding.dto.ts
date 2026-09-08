import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CompleteOnboardingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ enum: ['simple', 'advanced'], default: 'simple' })
  @IsString()
  @IsIn(['simple', 'advanced'])
  uiMode: 'simple' | 'advanced';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  applyTemplate?: boolean;
}

export class UpdateUiModeDto {
  @ApiProperty({ enum: ['simple', 'advanced'] })
  @IsString()
  @IsIn(['simple', 'advanced'])
  uiMode: 'simple' | 'advanced';
}

export class UpdateCatalogModeDto {
  @ApiProperty({ enum: ['per_store', 'central'] })
  @IsString()
  @IsIn(['per_store', 'central'])
  catalogMode: 'per_store' | 'central';
}
