import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({ description: 'Plan catalog document id' })
  @IsMongoId()
  planId: string;
}

export class CreateCheckoutSessionDto {
  @ApiProperty({ description: 'Plan catalog document id' })
  @IsMongoId()
  planId: string;

  @ApiProperty({ required: false })
  successUrl?: string;

  @ApiProperty({ required: false })
  cancelUrl?: string;
}

import { IsBoolean } from 'class-validator';

export class ToggleAutoRenewDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}
