import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantController } from './tenant.controller';
import { StoresController } from './stores.controller';
import { TenantService } from './tenant.service';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [TenantController, StoresController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
