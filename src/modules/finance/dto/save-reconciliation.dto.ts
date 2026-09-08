import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ClearedItemDto {
  @IsMongoId()
  entryId: string;

  @IsMongoId()
  lineId: string;
}

export class SaveReconciliationDto {
  @IsMongoId()
  accountId: string;

  @IsDateString()
  statementDate: string;

  @IsNumber()
  statementEndingBalance: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClearedItemDto)
  clearedItems?: ClearedItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
