import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsArray, IsOptional } from 'class-validator';

export class InviteDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Custom permissions to grant (overrides role defaults)',
  })
  @IsArray()
  @IsOptional()
  permissions?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Store IDs the staff member can access' })
  @IsArray()
  @IsOptional()
  storeAccess?: string[];
}

export class AcceptInviteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}

export class UpdateTransferStatusDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  status: string;
}
