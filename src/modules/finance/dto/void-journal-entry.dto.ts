import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VoidJournalEntryDto {
  @ApiProperty()
  @IsString()
  voidReason: string;
}
