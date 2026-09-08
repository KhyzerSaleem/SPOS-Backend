import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../../database/schemas/customer.schema';
import { CustomerGroup, CustomerGroupSchema } from '../../database/schemas/customer-group.schema';
import { SaleOrder, SaleOrderSchema } from '../../database/schemas/sale-order.schema';
import {
  LoyaltyTransaction,
  LoyaltyTransactionSchema,
} from '../../database/schemas/loyalty-transaction.schema';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerGroup.name, schema: CustomerGroupSchema },
      { name: SaleOrder.name, schema: SaleOrderSchema },
      { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
