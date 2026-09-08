import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ description: 'Role name to assign' })
  @IsString()
  role: string;

  @ApiProperty({ description: 'Optional user-level permission overrides', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
