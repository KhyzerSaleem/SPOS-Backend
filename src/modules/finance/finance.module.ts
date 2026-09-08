import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from './schemas/account.schema';
import { JournalEntry, JournalEntrySchema } from './schemas/journal-entry.schema';
import { Expense, ExpenseSchema } from '../../database/schemas/expense.schema';
import { FinancialPeriod, FinancialPeriodSchema } from './schemas/financial-period.schema';
import { BankReconciliation, BankReconciliationSchema } from './schemas/bank-reconciliation.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import {
  SupplierInvoice,
  SupplierInvoiceSchema,
} from '../../database/schemas/supplier-invoice.schema';
import { Customer, CustomerSchema } from '../../database/schemas/customer.schema';
import { Supplier, SupplierSchema } from '../../database/schemas/supplier.schema';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { ArApController } from './ar-ap.controller';
import { ArApService } from './ar-ap.service';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationService } from './bank-reconciliation.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: FinancialPeriod.name, schema: FinancialPeriodSchema },
      { name: BankReconciliation.name, schema: BankReconciliationSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: SupplierInvoice.name, schema: SupplierInvoiceSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Supplier.name, schema: SupplierSchema },
    ]),
  ],
  controllers: [FinanceController, ArApController, BankReconciliationController],
  providers: [FinanceService, ArApService, BankReconciliationService],
  exports: [FinanceService, ArApService],
})
export class FinanceModule {}
