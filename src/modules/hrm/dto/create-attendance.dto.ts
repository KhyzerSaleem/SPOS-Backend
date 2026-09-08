import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString, IsMongoId } from 'class-validator';

export class CreateAttendanceDto {
  @ApiProperty()
  @IsMongoId()
  employeeId: string;

  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @ApiProperty({
    enum: ['present', 'absent', 'late', 'half-day', 'holiday', 'leave'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['present', 'absent', 'late', 'half-day', 'holiday', 'leave'])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
