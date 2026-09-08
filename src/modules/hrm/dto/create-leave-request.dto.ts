import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString, IsMongoId, IsNumber } from 'class-validator';

export class CreateLeaveRequestDto {
  @ApiProperty()
  @IsMongoId()
  employeeId: string;

  @ApiProperty({ enum: ['annual', 'sick', 'casual', 'maternity', 'paternity', 'unpaid', 'other'] })
  @IsEnum(['annual', 'sick', 'casual', 'maternity', 'paternity', 'unpaid', 'other'])
  leaveType: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiProperty()
  @IsNumber()
  totalDays: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectLeaveDto {
  @ApiProperty()
  @IsString()
  rejectedReason: string;
}
