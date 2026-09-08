import { IsEmail, IsIn, IsOptional, IsString, MinLength, Matches } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  name: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'subdomain must be lowercase alphanumeric with dashes' })
  subdomain: string;

  @IsString()
  ownerName: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(8)
  ownerPassword: string;

  @IsOptional()
  @IsString()
  @IsIn(['trial', 'basic', 'pro', 'enterprise'])
  plan?: string;
}
