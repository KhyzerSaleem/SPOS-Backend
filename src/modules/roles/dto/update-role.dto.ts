import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateRoleDto } from './create-role.dto';

/**
 * Extends CreateRoleDto via PartialType — every field becomes optional and
 * inherits the same validators. Additional fields specific to updates
 * (isAssignable) are declared here.
 *
 * System-role restrictions (no rename, no level/isAssignable change) are
 * enforced in RolesService.updateRole(), not at the DTO layer.
 */
export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  // name, description, permissions, level are all inherited as optional
  // with their validators (@IsIn, @Transform, @Min/@Max, etc.) intact.

  @ApiProperty({
    description: 'Whether this role can be assigned to users. Cannot be changed for system roles.',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isAssignable?: boolean;
}
