import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { StoreGuard } from '../guards/store.guard';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Store.name, schema: StoreSchema }])],
  providers: [StoreGuard],
  exports: [StoreGuard, MongooseModule],
})
export class StoreGuardModule {}
