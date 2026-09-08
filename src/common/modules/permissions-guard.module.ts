import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { PermissionsGuard } from '../guards/permissions.guard';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Role.name, schema: RoleSchema }])],
  providers: [PermissionsGuard],
  exports: [PermissionsGuard, MongooseModule],
})
export class PermissionsGuardModule {}
