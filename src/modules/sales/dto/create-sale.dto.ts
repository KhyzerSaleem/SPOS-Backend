import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BackOfficeSaleItemDto {
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

export class BackOfficePaymentDto {
  @ApiProperty({ enum: ['cash', 'card', 'mobile', 'bank_transfer', 'cheque', 'other'] })
  @IsString()
  method: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  transactionId?: string;
}

export class CreateBackOfficeSaleDto {
  @ApiProperty({ type: [BackOfficeSaleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackOfficeSaleItemDto)
  items: BackOfficeSaleItemDto[];

  @ApiProperty({ type: [BackOfficePaymentDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackOfficePaymentDto)
  payments?: BackOfficePaymentDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  discount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  tax?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  paymentDueDate?: string;

  @ApiProperty({ enum: ['pending', 'completed'], required: false })
  @IsOptional()
  @IsString()
  status?: string;
}
