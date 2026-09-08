import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CatalogProduct,
  CatalogProductSchema,
} from '../../database/schemas/catalog-product.schema';
import { StoreListing, StoreListingSchema } from '../../database/schemas/store-listing.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CatalogProduct.name, schema: CatalogProductSchema },
      { name: StoreListing.name, schema: StoreListingSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
