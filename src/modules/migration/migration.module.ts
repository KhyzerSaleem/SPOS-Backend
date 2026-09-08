import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ImportJob, ImportJobSchema } from '../../database/schemas/import-job.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Customer, CustomerSchema } from '../../database/schemas/customer.schema';
import { Category, CategorySchema } from '../../database/schemas/category.schema';
import { Supplier, SupplierSchema } from '../../database/schemas/supplier.schema';
import { Warehouse, WarehouseSchema } from '../../database/schemas/warehouse.schema';
import { StockMovement, StockMovementSchema } from '../../database/schemas/stock-movement.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../../database/schemas/purchase-order.schema';
import {
  PurchaseReturn,
  PurchaseReturnSchema,
} from '../../database/schemas/purchase-return.schema';
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from '../../database/schemas/supplier-invoice.schema';
import { Expense, ExpenseSchema } from '../../database/schemas/expense.schema';
import { ExchangeRate, ExchangeRateSchema } from '../../database/schemas/exchange-rate.schema';
import { Account, AccountSchema } from '../finance/schemas/account.schema';
import { JournalEntry, JournalEntrySchema } from '../finance/schemas/journal-entry.schema';
import { StockLedgerModule } from '../../common/modules/stock-ledger.module';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';

@Module({
  imports: [
    StockLedgerModule,
    MongooseModule.forFeature([
      { name: ImportJob.name, schema: ImportJobSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: PurchaseReturn.name, schema: PurchaseReturnSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: ExchangeRate.name, schema: ExchangeRateSchema },
      { name: Account.name, schema: AccountSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
    ]),
  ],
  controllers: [MigrationController],
  providers: [MigrationService],
  exports: [MigrationService],
})
export class MigrationModule {}
