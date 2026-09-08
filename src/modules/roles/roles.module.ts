import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { RefreshToken, RefreshTokenSchema } from '../../database/schemas/refresh-token.schema';

/**
 * RolesModule — tenant role management (CRUD + assignment).
 *
 * Guard dependency note:
 * JwtAuthGuard and PermissionsGuard are applied in RolesController.
 * They must be available via one of:
 *   a) A globally registered GuardsModule (recommended — register in AppModule)
 *   b) Importing AuthModule here (acceptable but creates a heavier dependency)
 *
 * RolesService is exported so AppModule / AuthService can call
 * syncDefaultRolesForTenant() during bootstrap without re-registering schemas.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
