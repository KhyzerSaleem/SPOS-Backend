import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../../database/schemas/purchase-order.schema';
import { Expense, ExpenseSchema } from '../../database/schemas/expense.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Customer, CustomerSchema } from '../../database/schemas/customer.schema';
import { Supplier, SupplierSchema } from '../../database/schemas/supplier.schema';
import { Stock, StockSchema } from '../../database/schemas/stock.schema';
import { StockMovement, StockMovementSchema } from '../../database/schemas/stock-movement.schema';
import { Transfer, TransferSchema } from '../../database/schemas/transfer.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from '../../database/schemas/supplier-invoice.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../../database/schemas/product-variant.schema';
import {
  GoodsReceivedNote,
  GoodsReceivedNoteSchema,
} from '../../database/schemas/goods-received-note.schema';
import { PosShift, PosShiftSchema } from '../../database/schemas/pos-shift.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Stock.name, schema: StockSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Transfer.name, schema: TransferSchema },
      { name: User.name, schema: UserSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: GoodsReceivedNote.name, schema: GoodsReceivedNoteSchema },
      { name: PosShift.name, schema: PosShiftSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
