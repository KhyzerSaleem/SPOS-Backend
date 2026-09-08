import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../../database/schemas/product-variant.schema';
import { PriceHistory, PriceHistorySchema } from '../../database/schemas/price-history.schema';
import { Bundle, BundleSchema } from '../../database/schemas/bundle.schema';
import { Category, CategorySchema } from '../../database/schemas/category.schema';
import { Brand, BrandSchema } from '../../database/schemas/brand.schema';
import { Unit, UnitSchema } from '../../database/schemas/unit.schema';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
      { name: Bundle.name, schema: BundleSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Brand.name, schema: BrandSchema },
      { name: Unit.name, schema: UnitSchema },
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
