import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class HoldOrderItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty()
  @IsString()
  productName: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  discount?: number;
}

export class HoldOrderDto {
  @ApiProperty({ type: [HoldOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HoldOrderItemDto)
  items: HoldOrderItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  discount?: number;

  @ApiProperty({ required: false, description: 'Tax amount in currency (not rate)' })
  @IsOptional()
  @IsNumber()
  tax?: number;

  @ApiProperty({ required: false, enum: ['percent', 'flat'] })
  @IsOptional()
  @IsString()
  discountType?: string;

  @ApiProperty({ required: false, description: 'Raw discount input (% or flat amount)' })
  @IsOptional()
  @IsNumber()
  globalDiscount?: number;

  @ApiProperty({ required: false, description: 'Tax rate percentage' })
  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  terminalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
