import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Warehouse, WarehouseSchema } from '../../database/schemas/warehouse.schema';
import { Stock, StockSchema } from '../../database/schemas/stock.schema';
import { StockMovement, StockMovementSchema } from '../../database/schemas/stock-movement.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../../database/schemas/product-variant.schema';
import { StockLedgerService } from '../services/stock-ledger.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Stock.name, schema: StockSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
    ]),
  ],
  providers: [StockLedgerService],
  exports: [StockLedgerService],
})
export class StockLedgerModule {}
