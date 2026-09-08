import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Category, CategorySchema } from '../../database/schemas/category.schema';
import { Unit, UnitSchema } from '../../database/schemas/unit.schema';
import { PosSettings, PosSettingsSchema } from '../../database/schemas/pos-settings.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Unit.name, schema: UnitSchema },
      { name: PosSettings.name, schema: PosSettingsSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
