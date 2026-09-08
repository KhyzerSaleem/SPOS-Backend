import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../../database/schemas/product-variant.schema';
import { Customer, CustomerSchema } from '../../database/schemas/customer.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import { HeldOrder, HeldOrderSchema } from '../../database/schemas/held-order.schema';
import { PosSettings, PosSettingsSchema } from '../../database/schemas/pos-settings.schema';
import {
  InvoiceCounter,
  InvoiceCounterSchema,
} from '../../database/schemas/invoice-counter.schema';
import {
  Discount,
  DiscountSchema,
  PricingRule,
  PricingRuleSchema,
} from '../../database/schemas/settings.schema';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { PosPromotionService } from './pos-promotion.service';
import { PosShiftService } from './pos-shift.service';
import { CatalogModule } from '../catalog/catalog.module';
import { StoreListing, StoreListingSchema } from '../../database/schemas/store-listing.schema';
import { PosShift, PosShiftSchema } from '../../database/schemas/pos-shift.schema';
import {
  LoyaltyTransaction,
  LoyaltyTransactionSchema,
} from '../../database/schemas/loyalty-transaction.schema';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    CatalogModule,
    FinanceModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: HeldOrder.name, schema: HeldOrderSchema },
      { name: PosSettings.name, schema: PosSettingsSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: Discount.name, schema: DiscountSchema },
      { name: PricingRule.name, schema: PricingRuleSchema },
      { name: StoreListing.name, schema: StoreListingSchema },
      { name: PosShift.name, schema: PosShiftSchema },
      { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
    ]),
  ],
  controllers: [PosController],
  providers: [PosService, PosPromotionService, PosShiftService],
})
export class PosModule {}
