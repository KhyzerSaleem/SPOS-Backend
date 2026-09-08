import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiKey, ApiKeySchema } from '../../database/schemas/settings.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { CatalogModule } from '../catalog/catalog.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiService } from './api.service';
import { V1Controller } from './v1.controller';

@Module({
  imports: [
    CatalogModule,
    MongooseModule.forFeature([
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Product.name, schema: ProductSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [V1Controller],
  providers: [ApiKeyGuard, ApiService],
  exports: [ApiKeyGuard, ApiService],
})
export class ApiModule {}
