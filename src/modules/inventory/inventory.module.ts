import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { Warehouse, WarehouseSchema } from '../../database/schemas/warehouse.schema';
import { Stock, StockSchema } from '../../database/schemas/stock.schema';
import { StockMovement, StockMovementSchema } from '../../database/schemas/stock-movement.schema';
import {
  StockAdjustment,
  StockAdjustmentSchema,
} from '../../database/schemas/stock-adjustment.schema';
import { Transfer, TransferSchema } from '../../database/schemas/transfer.schema';
import { Batch, BatchSchema } from '../../database/schemas/batch.schema';
import { CycleCount, CycleCountSchema } from '../../database/schemas/cycle-count.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { StockLedgerModule } from '../../common/modules/stock-ledger.module';

@Module({
  imports: [
    StockLedgerModule,
    MongooseModule.forFeature([
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Stock.name, schema: StockSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: StockAdjustment.name, schema: StockAdjustmentSchema },
      { name: Transfer.name, schema: TransferSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: CycleCount.name, schema: CycleCountSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
