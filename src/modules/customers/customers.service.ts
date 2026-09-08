import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { CustomerGroup, CustomerGroupDocument } from '../../database/schemas/customer-group.schema';
import {
  notDeletedFilter,
  softDeleteUpdate,
  restoreUpdate,
} from '../../common/utils/soft-delete.util';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import {
  LoyaltyTransaction,
  LoyaltyTransactionDocument,
} from '../../database/schemas/loyalty-transaction.schema';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerGroup.name) private groupModel: Model<CustomerGroupDocument>,
    @InjectModel(SaleOrder.name) private saleModel: Model<SaleOrderDocument>,
    @InjectModel(LoyaltyTransaction.name)
    private loyaltyTxModel: Model<LoyaltyTransactionDocument>,
  ) {}

  private normalizeOptionalText(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeNonNegative(value: unknown, field: string) {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number < 0) {
      throw new BadRequestException(`${field} cannot be negative`);
    }
    return Math.round(number * 100) / 100;
  }

  private normalizeDiscount(value: unknown) {
    const number = this.normalizeNonNegative(value, 'Discount percent');
    if (number > 100) throw new BadRequestException('Discount percent cannot exceed 100');
    return number;
  }

  private async assertContactAvailable(
    tenantId: string,
    storeId: string,
    email?: string,
    phone?: string,
    excludeId?: string,
  ) {
    const or: any[] = [];
    if (email) or.push({ email });
    if (phone) or.push({ phone });
    if (!or.length) return;
    const existing = await this.customerModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}),
      $or: or,
      ...notDeletedFilter(),
    });
    if (existing)
      throw new BadRequestException('Customer email or phone already exists in this store');
  }

  async findAll(tenantId: string, storeId: string, query: Record<string, string>) {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      ...notDeletedFilter(),
    };
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.min(100, parseInt(query.limit as string, 10) || 20);

    const [data, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.customerModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(tenantId: string, storeId: string, id: string) {
    const customer = await this.customerModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      })
      .lean();
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(tenantId: string, storeId: string, dto: Record<string, unknown>) {
    const email = this.normalizeOptionalText(dto.email);
    const phone = this.normalizeOptionalText(dto.phone);
    await this.assertContactAvailable(tenantId, storeId, email, phone);
    let groupName = '';
    let groupId: Types.ObjectId | null = null;
    if (dto.groupId) {
      const group = await this.groupModel.findOne({
        _id: new Types.ObjectId(dto.groupId as string),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      });
      if (!group) throw new BadRequestException('Customer group does not belong to this store');
      groupId = group._id;
      groupName = group.name;
    }

    return this.customerModel.create({
      name: dto.name,
      email,
      phone,
      avatar: dto.avatar ?? '',
      country: dto.country ?? '',
      address: dto.address ?? '',
      notes: dto.notes ?? '',
      groupId,
      groupName,
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
  }

  async update(tenantId: string, storeId: string, id: string, dto: Record<string, unknown>) {
    const email = dto.email !== undefined ? this.normalizeOptionalText(dto.email) : undefined;
    const phone = dto.phone !== undefined ? this.normalizeOptionalText(dto.phone) : undefined;
    await this.assertContactAvailable(tenantId, storeId, email, phone, id);
    const updates: Record<string, unknown> = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.email !== undefined && { email }),
      ...(dto.phone !== undefined && { phone }),
      ...(dto.avatar !== undefined && { avatar: dto.avatar }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.creditLimit !== undefined && {
        creditLimit: this.normalizeNonNegative(dto.creditLimit, 'Credit limit'),
      }),
    };

    if (dto.groupId !== undefined) {
      if (dto.groupId) {
        const group = await this.groupModel.findOne({
          _id: new Types.ObjectId(dto.groupId as string),
          tenantId: new Types.ObjectId(tenantId),
          storeId: new Types.ObjectId(storeId),
        });
        if (!group) throw new BadRequestException('Customer group does not belong to this store');
        updates.groupId = group._id;
        updates.groupName = group.name;
      } else {
        updates.groupId = null;
        updates.groupName = '';
      }
    }

    const customer = await this.customerModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      { $set: updates },
      { new: true },
    );
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async delete(tenantId: string, storeId: string, id: string, deletedBy?: string) {
    const result = await this.customerModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      },
      softDeleteUpdate(deletedBy),
    );
    if (result.modifiedCount === 0) throw new NotFoundException('Customer not found');
    return { deleted: true };
  }

  async restore(tenantId: string, storeId: string, id: string) {
    const customer = await this.customerModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        deletedAt: { $ne: null },
      },
      restoreUpdate(),
      { new: true },
    );
    if (!customer) throw new NotFoundException('Deleted customer not found');
    return customer;
  }

  async findSales(tenantId: string, storeId: string, id: string, query: Record<string, string>) {
    await this.findOne(tenantId, storeId, id);

    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.min(100, parseInt(query.limit as string, 10) || 20);

    const filter = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      customerId: new Types.ObjectId(id),
      type: 'sale',
    };

    const [data, total] = await Promise.all([
      this.saleModel
        .find(filter)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('orderNumber invoiceNumber totalAmount status paymentStatus date items')
        .lean(),
      this.saleModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getLoyalty(tenantId: string, storeId: string, id: string) {
    const customer = await this.findOne(tenantId, storeId, id);
    const points = Number((customer as any).loyaltyPoints || 0);
    const tier = (customer as any).loyaltyTier || 'standard';

    const transactions = await this.loyaltyTxModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        customerId: new Types.ObjectId(id),
      })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    const totalEarned = transactions
      .filter((t) => t.type === 'earn')
      .reduce((s, t) => s + Math.max(0, t.points), 0);
    const totalRedeemed = transactions
      .filter((t) => t.type === 'redeem')
      .reduce((s, t) => s + Math.abs(t.points), 0);

    const history = transactions.map((tx) => ({
      _id: tx._id.toString(),
      type: tx.type,
      points: tx.points,
      notes: tx.notes,
      reason: tx.notes,
      reference: tx.saleId?.toString?.() || '',
      date: tx.date,
      createdAt: (tx as any).createdAt,
    }));

    return {
      points,
      balance: points,
      currentPoints: points,
      tier,
      totalEarned,
      totalRedeemed,
      history,
      transactions: history,
    };
  }

  async adjustLoyalty(
    tenantId: string,
    storeId: string,
    id: string,
    body: { points?: number; delta?: number },
  ) {
    const customer = await this.customerModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!customer) throw new NotFoundException('Customer not found');

    let newPoints = customer.loyaltyPoints || 0;
    const oldPoints = newPoints;
    if (body.points != null) {
      newPoints = Math.max(0, Number(body.points));
    } else if (body.delta != null) {
      newPoints = Math.max(0, newPoints + Number(body.delta));
    }

    customer.loyaltyPoints = newPoints;
    if (newPoints >= 5000) customer.loyaltyTier = 'gold';
    else if (newPoints >= 1000) customer.loyaltyTier = 'silver';
    else customer.loyaltyTier = 'standard';

    await customer.save();

    const pointDelta = newPoints - oldPoints;
    if (pointDelta !== 0) {
      await this.loyaltyTxModel.create({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        customerId: customer._id,
        type: 'adjust',
        points: pointDelta,
        notes: 'Manual adjustment',
        date: new Date(),
      });
    }

    return { points: newPoints, tier: customer.loyaltyTier, message: 'Loyalty adjusted' };
  }

  async getCredit(tenantId: string, storeId: string, id: string) {
    const customer = await this.findOne(tenantId, storeId, id);
    return {
      balance: Number((customer as any).creditBalance || 0),
      limit: Number((customer as any).creditLimit || 0),
      transactions: [],
    };
  }

  async recordPayment(
    tenantId: string,
    storeId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const customer = await this.customerModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const amount = this.normalizeNonNegative(body.amount, 'Payment amount');
    if (amount <= 0) throw new BadRequestException('Payment amount must be positive');

    customer.creditBalance = Math.max(0, (customer.creditBalance || 0) - amount);
    await customer.save();
    return { success: true, amount, balance: customer.creditBalance };
  }

  async findPayments(
    _tenantId: string,
    _storeId: string,
    _id: string,
    query: Record<string, string>,
  ) {
    return {
      data: [],
      total: 0,
      page: parseInt(query.page as string, 10) || 1,
      limit: 20,
      pages: 0,
    };
  }

  async findGroups(tenantId: string, storeId: string) {
    return this.groupModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .sort({ name: 1 })
      .lean();
  }

  async createGroup(tenantId: string, storeId: string, body: Record<string, unknown>) {
    const name = this.normalizeOptionalText(body.name);
    if (!name) throw new BadRequestException('Group name is required');
    return this.groupModel.create({
      name,
      description: body.description ?? '',
      discountPercent: this.normalizeDiscount(body.discountPercent),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
  }

  async updateGroup(tenantId: string, storeId: string, id: string, body: Record<string, unknown>) {
    const group = await this.groupModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      {
        $set: {
          ...(body.name !== undefined && { name: this.normalizeOptionalText(body.name) }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.discountPercent !== undefined && {
            discountPercent: this.normalizeDiscount(body.discountPercent),
          }),
        },
      },
      { new: true },
    );
    if (!group) throw new NotFoundException('Customer group not found');

    if (body.name !== undefined) {
      await this.customerModel.updateMany(
        {
          groupId: new Types.ObjectId(id),
          tenantId: new Types.ObjectId(tenantId),
          storeId: new Types.ObjectId(storeId),
        },
        { $set: { groupName: body.name } },
      );
    }

    return group;
  }

  async deleteGroup(tenantId: string, storeId: string, id: string) {
    const result = await this.groupModel.deleteOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Customer group not found');
    await this.customerModel.updateMany(
      {
        groupId: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      },
      { $set: { groupId: null, groupName: '' } },
    );
    return { deleted: true, _id: id };
  }
}
