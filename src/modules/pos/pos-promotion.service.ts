import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Discount, DiscountDocument } from '../../database/schemas/settings.schema';
import { PricingRule, PricingRuleDocument } from '../../database/schemas/settings.schema';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { roundMoney } from '../../common/utils/money.util';

interface CartItemInput {
  productId: string;
  productName?: string;
  price: number;
  quantity: number;
  categoryId?: string | null;
  categoryName?: string;
}

@Injectable()
export class PosPromotionService {
  constructor(
    @InjectModel(Discount.name) private discountModel: Model<DiscountDocument>,
    @InjectModel(PricingRule.name) private pricingModel: Model<PricingRuleDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  private isActiveDateRule(startDate?: Date | null, endDate?: Date | null): boolean {
    const now = new Date();
    if (startDate && now < new Date(startDate)) return false;
    if (endDate && now > new Date(endDate)) return false;
    return true;
  }

  async evaluate(
    tenantId: string,
    storeId: string,
    payload: { items: CartItemInput[]; customerId?: string; subtotal?: number },
  ) {
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);

    const subtotal =
      payload.subtotal ?? payload.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    let customerGroup = '';
    if (payload.customerId) {
      const customer = await this.customerModel
        .findOne({ _id: new Types.ObjectId(payload.customerId), tenantId: tid, storeId: sid })
        .lean();
      customerGroup =
        (customer as any)?.groupName || (customer as any)?.groupId?.toString?.() || '';
    }

    const discounts = await this.discountModel
      .find({
        tenantId: tid,
        isActive: true,
        $or: [{ storeId: sid }, { storeId: null }],
      })
      .lean();

    const pricingRules = await this.pricingModel
      .find({
        tenantId: tid,
        isActive: true,
        $or: [{ storeId: sid }, { storeId: null }],
      })
      .sort({ priority: 1 })
      .lean();

    const applicableDiscounts = discounts
      .filter((d) => this.isActiveDateRule(d.startDate, d.endDate))
      .filter((d) => subtotal >= Number(d.minOrderAmount || 0))
      .map((d) => {
        let amount =
          d.type === 'percentage'
            ? roundMoney((subtotal * Number(d.value)) / 100)
            : roundMoney(Number(d.value));
        if (d.maxDiscount != null && amount > Number(d.maxDiscount)) {
          amount = roundMoney(Number(d.maxDiscount));
        }
        return {
          id: d._id.toString(),
          name: d.name,
          type: d.type,
          value: d.value,
          discountAmount: amount,
          source: 'discount' as const,
        };
      })
      .sort((a, b) => b.discountAmount - a.discountAmount);

    const applicablePricing = pricingRules
      .filter((r) => !r.customerGroup || r.customerGroup === customerGroup)
      .map((r) => {
        const matchingItems = payload.items.filter((item) => {
          if (!r.productCategory) return true;
          return (
            item.categoryId === r.productCategory ||
            item.categoryName?.toLowerCase() === r.productCategory.toLowerCase()
          );
        });
        const matchingSubtotal = matchingItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        if (matchingSubtotal <= 0) return null;

        let amount = 0;
        if (r.discountType === 'percentage') {
          amount = roundMoney((matchingSubtotal * Number(r.discountValue)) / 100);
        } else if (r.discountType === 'fixed') {
          amount = roundMoney(Number(r.discountValue));
        } else {
          amount = 0;
        }

        return {
          id: r._id.toString(),
          name: r.name,
          type: r.discountType,
          value: r.discountValue,
          discountAmount: amount,
          source: 'pricing' as const,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.discountAmount - a!.discountAmount) as Array<{
      id: string;
      name: string;
      type: string;
      value: number;
      discountAmount: number;
      source: 'pricing';
    }>;

    const bestDiscount = applicableDiscounts[0] || null;
    const bestPricing = applicablePricing[0] || null;

    let recommended:
      (typeof applicableDiscounts)[number] | (typeof applicablePricing)[number] | null =
      bestDiscount;
    if (
      bestPricing &&
      (!bestDiscount || bestPricing.discountAmount > bestDiscount.discountAmount)
    ) {
      recommended = bestPricing;
    }

    return {
      subtotal,
      recommended,
      discounts: applicableDiscounts,
      pricingRules: applicablePricing,
    };
  }
}
