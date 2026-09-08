import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class IdsBodyDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}

export class DeleteTenantDto {
  @ApiProperty({ description: 'Type the tenant name to confirm irreversible deletion.' })
  @IsString()
  confirmation: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkDeleteTenantsDto extends IdsBodyDto {
  @ApiProperty({ description: 'Type DELETE <count> to confirm irreversible bulk deletion.' })
  @IsString()
  confirmation: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkSetPlanDto extends IdsBodyDto {
  @ApiProperty({ enum: ['trial', 'basic', 'pro', 'enterprise'] })
  @IsString()
  @IsIn(['trial', 'basic', 'pro', 'enterprise'])
  plan: string;
}

export class BulkSetUserStatusDto extends IdsBodyDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class SetTenantPlanDto {
  @ApiProperty({ enum: ['trial', 'basic', 'pro', 'enterprise'] })
  @IsString()
  @IsIn(['trial', 'basic', 'pro', 'enterprise'])
  plan: string;
}

export class SetUserStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}
