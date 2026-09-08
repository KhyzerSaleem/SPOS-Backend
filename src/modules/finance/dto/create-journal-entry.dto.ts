import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  IsNumber,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class JournalLineDto {
  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty({ default: 0 })
  @IsNumber()
  @Min(0)
  debit: number;

  @ApiProperty({ default: 0 })
  @IsNumber()
  @Min(0)
  credit: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateJournalEntryDto {
  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ type: [JournalLineDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;
}
