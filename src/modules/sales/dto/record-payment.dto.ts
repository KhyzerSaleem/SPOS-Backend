import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class RecordPaymentDto {
  @ApiProperty({ enum: ['cash', 'card', 'mobile', 'bank_transfer', 'cheque', 'other'] })
  @IsString()
  method: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
