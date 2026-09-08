import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import {
  InvoiceCounter,
  InvoiceCounterSchema,
} from '../../database/schemas/invoice-counter.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../../database/schemas/product-variant.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    FinanceModule,
    MongooseModule.forFeature([
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
  ],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
