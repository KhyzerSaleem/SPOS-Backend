import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { ExchangeRate, ExchangeRateSchema } from '../../database/schemas/exchange-rate.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import { Expense, ExpenseSchema } from '../../database/schemas/expense.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../../database/schemas/purchase-order.schema';
import { CurrencyService } from '../services/currency.service';
import { CurrencyBackfillService } from '../services/currency-backfill.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Store.name, schema: StoreSchema },
      { name: ExchangeRate.name, schema: ExchangeRateSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
    ]),
  ],
  providers: [CurrencyService, CurrencyBackfillService],
  exports: [CurrencyService, CurrencyBackfillService],
})
export class CurrencyModule {}
