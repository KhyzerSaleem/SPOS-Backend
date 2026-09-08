import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsIn,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ALL_PERMISSIONS } from '../../../database/schemas/role.schema';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Role name — must be unique within the tenant. Stored as lowercase.',
    example: 'store manager',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  name: string;

  @ApiProperty({
    description: 'Human-readable description of the role',
    required: false,
    example: 'Manages store operations and staff',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiProperty({
    description:
      'Permission strings to assign. Must be valid entries from the permissions catalogue.',
    required: false,
    example: ['sales.view', 'products.edit'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: string[];

  @ApiProperty({
    description:
      'Hierarchy level (0–89). Higher = more authority. Cannot equal or exceed system role levels.',
    required: false,
    example: 50,
    minimum: 0,
    maximum: 89,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(89) // system roles start at 90 (admin) — custom roles cannot match or exceed them
  level?: number;
}
