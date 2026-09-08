import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../../database/schemas/purchase-order.schema';
import { Expense, ExpenseSchema } from '../../database/schemas/expense.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Customer, CustomerSchema } from '../../database/schemas/customer.schema';
import { Supplier, SupplierSchema } from '../../database/schemas/supplier.schema';
import { Category, CategorySchema } from '../../database/schemas/category.schema';
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from '../../database/schemas/supplier-invoice.schema';
import { Stock, StockSchema } from '../../database/schemas/stock.schema';
import {
  PurchaseReturn,
  PurchaseReturnSchema,
} from '../../database/schemas/purchase-return.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Category.name, schema: CategorySchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Stock.name, schema: StockSchema },
      { name: PurchaseReturn.name, schema: PurchaseReturnSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
