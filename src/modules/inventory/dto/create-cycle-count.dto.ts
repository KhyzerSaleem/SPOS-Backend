import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCycleCountDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}

class CycleCountItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNumber()
  expected: number;

  @ApiProperty()
  @IsNumber()
  counted: number;
}

export class SubmitCycleCountDto {
  @ApiProperty({ type: [CycleCountItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CycleCountItemDto)
  items: CycleCountItemDto[];
}
