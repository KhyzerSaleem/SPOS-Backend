import { IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import {
  IMPORT_ENTITY_TYPES,
  ImportDuplicateStrategy,
  ImportEntityType,
} from '../../../database/schemas/import-job.schema';

export class ParseImportDto {
  @IsEnum(IMPORT_ENTITY_TYPES)
  entityType: ImportEntityType;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsEnum(['csv', 'json', 'xlsx'])
  format?: 'csv' | 'json' | 'xlsx';

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsObject()
  columnMapping?: Record<string, string>;

  @IsOptional()
  @IsEnum(['skip', 'update', 'restore'])
  duplicateStrategy?: ImportDuplicateStrategy;
}

export class RunImportDto {
  @IsString()
  jobId: string;
}
