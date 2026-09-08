import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PurchaseOrder, PurchaseOrderSchema } from '../../database/schemas/purchase-order.schema';
import {
  GoodsReceivedNote,
  GoodsReceivedNoteSchema,
} from '../../database/schemas/goods-received-note.schema';
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from '../../database/schemas/supplier-invoice.schema';
import {
  PurchaseReturn,
  PurchaseReturnSchema,
} from '../../database/schemas/purchase-return.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Stock, StockSchema } from '../../database/schemas/stock.schema';
import { Warehouse, WarehouseSchema } from '../../database/schemas/warehouse.schema';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import {
  InvoiceCounter,
  InvoiceCounterSchema,
} from '../../database/schemas/invoice-counter.schema';
import { Supplier, SupplierSchema } from '../../database/schemas/supplier.schema';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    FinanceModule,
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: GoodsReceivedNote.name, schema: GoodsReceivedNoteSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: PurchaseReturn.name, schema: PurchaseReturnSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Stock.name, schema: StockSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Store.name, schema: StoreSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: Supplier.name, schema: SupplierSchema },
    ]),
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
