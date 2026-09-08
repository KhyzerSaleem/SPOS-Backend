import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PLATFORM_ROLES } from '../../../common/constants/platform-roles';

const ASSIGNABLE_PLATFORM_ROLES = PLATFORM_ROLES.filter((r) => r !== 'super_admin');

export class CreatePlatformTeamMemberDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ enum: ASSIGNABLE_PLATFORM_ROLES })
  @IsString()
  @IsIn(ASSIGNABLE_PLATFORM_ROLES)
  role: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  jobTitle?: string;
}

export class UpdatePlatformTeamMemberDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ enum: ASSIGNABLE_PLATFORM_ROLES, required: false })
  @IsOptional()
  @IsString()
  @IsIn(ASSIGNABLE_PLATFORM_ROLES)
  role?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  jobTitle?: string;
}
