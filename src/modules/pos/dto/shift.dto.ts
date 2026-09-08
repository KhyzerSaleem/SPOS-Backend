import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OpenShiftDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  openingFloat: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  terminalId?: string;
}

export class CloseShiftDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  countedCash: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  closingFloat?: number;
}
