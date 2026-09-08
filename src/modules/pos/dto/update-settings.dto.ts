import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdatePosSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paymentMethods?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  defaultTaxRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  printReceiptOnSale?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  receiptHeader?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  receiptFooter?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  receiptSize?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  printerConnectionType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  printerName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  printerHost?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  printerPort?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  printerPaperSize?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  cashDrawerEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  autoOpenCashDrawer?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  requireShift?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  loyaltyEarnRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  loyaltyRedeemRate?: number;
}
