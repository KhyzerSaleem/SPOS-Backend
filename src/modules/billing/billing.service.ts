import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Plan, PlanDocument } from '../../database/schemas/plan.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Subscription, SubscriptionDocument } from '../../database/schemas/subscription.schema';
import {
  BillingInvoice,
  BillingInvoiceDocument,
} from '../../database/schemas/billing-invoice.schema';
import {
  StripeWebhookEvent,
  StripeWebhookEventDocument,
} from '../../database/schemas/stripe-webhook-event.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { Setting, SettingDocument } from '../../database/schemas/settings.schema';
import {
  buildTenantPlanUpdate,
  normalizePlanTier,
  PLAN_DEFINITIONS,
} from '../../common/constants/plan-features';
import {
  isTrialWindowActive,
  resolveTrialEndDate,
  shouldRepairTrialStatus,
  TRIAL_PERIOD_DAYS,
} from '../../common/utils/subscription-access.util';
import { roundMoney } from '../../common/utils/money.util';
import { escapeRegex } from '../../common/utils/regex.util';
import { AuditService } from '../../common/services/audit.service';
import { PlanLimitsService } from '../../common/services/plan-limits.service';

/** Stripe Checkout supports many ISO currencies; fallback to USD when unsupported. */
const STRIPE_CHECKOUT_CURRENCIES = new Set([
  'usd',
  'eur',
  'gbp',
  'cad',
  'aud',
  'jpy',
  'inr',
  'pkr',
  'aed',
  'sar',
  'try',
  'brl',
  'mxn',
  'sgd',
  'hkd',
  'nzd',
  'chf',
  'sek',
  'nok',
  'dkk',
  'pln',
  'czk',
  'huf',
  'myr',
  'thb',
  'php',
  'idr',
  'ngn',
  'bdt',
]);

const DEFAULT_CATALOG_PLANS: Array<{
  name: string;
  price: number;
  sortOrder: number;
  description: string;
  features: string[];
  userLimit: number;
  storeLimit: number;
  storageLimitMB: number;
}> = [
  {
    name: 'Basic',
    price: 29,
    sortOrder: 1,
    description: PLAN_DEFINITIONS.basic.description,
    features: [
      'Point of Sale',
      'Products & inventory',
      'Sales & customers',
      'Reports',
      '1 store · up to 5 users',
    ],
    userLimit: PLAN_DEFINITIONS.basic.maxUsers,
    storeLimit: PLAN_DEFINITIONS.basic.maxStores,
    storageLimitMB: PLAN_DEFINITIONS.basic.maxStorageMB,
  },
  {
    name: 'Pro',
    price: 79,
    sortOrder: 2,
    description: PLAN_DEFINITIONS.pro.description,
    features: [
      'Everything in Basic',
      'Multi-store (up to 5)',
      'Purchases & suppliers',
      'HRM module',
      'Up to 15 users',
    ],
    userLimit: PLAN_DEFINITIONS.pro.maxUsers,
    storeLimit: PLAN_DEFINITIONS.pro.maxStores,
    storageLimitMB: PLAN_DEFINITIONS.pro.maxStorageMB,
  },
  {
    name: 'Enterprise',
    price: 199,
    sortOrder: 3,
    description: PLAN_DEFINITIONS.enterprise.description,
    features: [
      'Everything in Pro',
      'Finance & accounting',
      'API access',
      'Audit log & webhooks',
      'Unlimited stores & users',
    ],
    userLimit: PLAN_DEFINITIONS.enterprise.maxUsers,
    storeLimit: PLAN_DEFINITIONS.enterprise.maxStores,
    storageLimitMB: PLAN_DEFINITIONS.enterprise.maxStorageMB,
  },
];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(BillingInvoice.name) private billingInvoiceModel: Model<BillingInvoiceDocument>,
    @InjectModel(StripeWebhookEvent.name)
    private stripeWebhookEventModel: Model<StripeWebhookEventDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(SaleOrder.name) private saleModel: Model<SaleOrderDocument>,
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    private auditService: AuditService,
    private planLimitsService: PlanLimitsService,
  ) {}

  private async resolveTenantCurrency(tenantId: string): Promise<string> {
    const tenant = await this.tenantModel.findById(tenantId).lean();
    const settingsCurrency = (tenant?.settings as any)?.currency;
    if (typeof settingsCurrency === 'string' && settingsCurrency.length >= 3) {
      return settingsCurrency.toUpperCase();
    }
    const store = await this.storeModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), isActive: true })
      .lean();
    if (store?.currency) return String(store.currency).toUpperCase();
    const currencySetting = await this.settingModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), key: 'currency' })
      .lean();
    const code = (currencySetting?.value as any)?.code;
    return typeof code === 'string' ? code.toUpperCase() : 'USD';
  }

  private stripeEnabled(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  }

  /** Ensure paid catalog plans exist so tenants can upgrade from trial. */
  private async ensureDefaultPlans(): Promise<void> {
    for (const plan of DEFAULT_CATALOG_PLANS) {
      await this.planModel.findOneAndUpdate(
        { name: plan.name },
        {
          $set: {
            price: plan.price,
            sortOrder: plan.sortOrder,
            description: plan.description,
            features: plan.features,
            userLimit: plan.userLimit,
            storeLimit: plan.storeLimit,
            storageLimitMB: plan.storageLimitMB,
            isActive: true,
            period: 'monthly',
          },
          $setOnInsert: { name: plan.name },
        },
        { upsert: true },
      );
    }
  }

  async getSubscription(tenantId: string): Promise<Record<string, unknown>> {
    const tenant = await this.tenantModel
      .findById(tenantId)
      .select('plan subscriptionEndDate subscriptionStartDate')
      .lean<{ plan?: string; subscriptionEndDate?: Date; subscriptionStartDate?: Date }>();

    let sub = await this.subscriptionModel.findOne({ tenantId }).lean();
    const currency = await this.resolveTenantCurrency(tenantId);
    const stripeEnabled = this.stripeEnabled();

    if (sub && shouldRepairTrialStatus(sub, tenant)) {
      await this.subscriptionModel.updateOne({ tenantId }, { $set: { status: 'trial' } });
      sub = { ...sub, status: 'trial' };
    }

    if (sub) {
      const trialEndsAt = resolveTrialEndDate(sub, tenant);
      return {
        ...sub,
        status: isTrialWindowActive(sub, tenant) ? 'trial' : sub.status,
        trialEndsAt,
        currency,
        stripeEnabled,
      };
    }

    const now = new Date();
    const trialEnd =
      tenant?.subscriptionEndDate ??
      new Date(now.getTime() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.subscriptionModel.create({
      tenantId: new Types.ObjectId(tenantId),
      planId: new Types.ObjectId(),
      planName: 'Trial',
      price: 0,
      status: 'trial',
      billingCycle: 'monthly',
      startDate: tenant?.subscriptionStartDate ?? now,
      renewalDate: trialEnd,
      trialEndsAt: trialEnd,
      autoRenew: false,
    });

    if (normalizePlanTier(tenant?.plan) === 'trial' && !tenant?.subscriptionEndDate) {
      await this.tenantModel.findByIdAndUpdate(tenantId, {
        $set: { subscriptionEndDate: trialEnd },
      });
    }

    return { ...created.toObject(), currency, stripeEnabled };
  }

  async getPlans() {
    await this.ensureDefaultPlans();
    return this.planModel
      .find({ isActive: true, price: { $gt: 0 } })
      .sort({ sortOrder: 1, price: 1 })
      .lean();
  }

  async applyPlanChange(
    tenantId: string,
    planNameOrTier: string,
    opts?: { actorUserId?: string; actorName?: string; source?: string; ip?: string },
  ) {
    const tier = normalizePlanTier(planNameOrTier);
    const planFields = buildTenantPlanUpdate(tier);
    const tenant = await this.tenantModel.findById(tenantId).lean();
    const previousPlan = tenant?.plan || 'basic';

    await this.tenantModel.findByIdAndUpdate(tenantId, {
      $set: { ...planFields, isActive: true },
    });

    // Restore owner access after billing recovery without reviving every manually disabled staff user.
    await this.userModel.updateMany(
      { tenantId: new Types.ObjectId(tenantId), role: { $in: ['owner', 'admin'] } },
      { $set: { isActive: true } },
    );

    const catalogPlan = await this.planModel
      .findOne({ name: new RegExp(`^${escapeRegex(tier)}$`, 'i'), isActive: true })
      .lean();

    let sub = await this.subscriptionModel.findOne({ tenantId });
    const now = new Date();
    const renewalDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (!sub) {
      sub = await this.subscriptionModel.create({
        tenantId: new Types.ObjectId(tenantId),
        planId: catalogPlan?._id || new Types.ObjectId(),
        planName: catalogPlan?.name || tier,
        price: catalogPlan?.price || 0,
        status: 'active',
        billingCycle: 'monthly',
        startDate: now,
        renewalDate,
        autoRenew: true,
      });
    } else {
      sub.planId = (catalogPlan?._id || sub.planId) as any;
      sub.planName = catalogPlan?.name || tier;
      sub.price = catalogPlan?.price ?? sub.price;
      sub.status = 'active';
      sub.renewalDate = renewalDate;
      sub.trialEndsAt = null;
      await sub.save();
    }

    if (opts?.actorUserId) {
      await this.auditService.log({
        tenantId,
        userId: opts.actorUserId,
        userName: opts.actorName || 'System',
        action: 'plan.change',
        entity: 'tenant',
        entityId: tenantId,
        summary: `Plan changed from ${previousPlan} to ${tier} (${opts.source || 'manual'})`,
        before: { plan: previousPlan },
        after: { plan: tier },
        ip: opts.ip,
      });
    }

    return { message: 'Plan updated', plan: tier, subscription: sub };
  }

  async changePlan(
    tenantId: string,
    planId: string,
    actor?: { userId: string; userName: string; ip?: string },
  ) {
    const plan = await this.planModel.findById(planId);
    if (!plan) throw new NotFoundException('Plan not found');

    if (
      this.stripeEnabled() &&
      plan.price > 0 &&
      process.env.STRIPE_ALLOW_MANUAL_CHANGE_PLAN !== 'true'
    ) {
      throw new BadRequestException(
        'Paid plan upgrades require Stripe Checkout. Use POST /api/billing/create-checkout-session.',
      );
    }

    const currency = await this.resolveTenantCurrency(tenantId);
    const result = await this.applyPlanChange(tenantId, plan.name, {
      actorUserId: actor?.userId,
      actorName: actor?.userName,
      source: 'billing.change-plan',
      ip: actor?.ip,
    });

    const sub = await this.subscriptionModel.findOne({ tenantId });
    const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
    const stripeActive = this.stripeEnabled();
    await this.billingInvoiceModel.create({
      tenantId: new Types.ObjectId(tenantId),
      subscriptionId: sub?._id,
      invoiceNumber: invoiceNum,
      amount: plan.price,
      currency,
      status: stripeActive ? 'pending' : 'paid',
      description: `Subscription: ${plan.name} (Monthly)`,
      planName: plan.name,
      paymentMethod: stripeActive ? 'system' : 'manual',
      dueDate: new Date(),
      ...(stripeActive ? {} : { paidAt: new Date() }),
    });

    return { ...result, subscription: sub };
  }

  async toggleAutoRenew(tenantId: string, enabled: boolean) {
    const sub = await this.subscriptionModel.findOne({ tenantId });
    if (!sub) throw new NotFoundException('No subscription found');

    sub.autoRenew = enabled;
    await sub.save();
    return { autoRenew: sub.autoRenew };
  }

  async getBillingHistory(
    tenantId: string,
    page = 1,
    limit = 10,
  ): Promise<{
    data: Record<string, unknown>[];
    total: number;
    totalPages: number;
    page: number;
    currency: string;
  }> {
    const query = { tenantId: new Types.ObjectId(tenantId) };
    const currency = await this.resolveTenantCurrency(tenantId);
    const [data, total] = await Promise.all([
      this.billingInvoiceModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.billingInvoiceModel.countDocuments(query),
    ]);
    return {
      data: data.map((row) => ({ ...row, currency: row.currency || currency })),
      total,
      totalPages: Math.ceil(total / limit),
      page,
      currency,
    };
  }

  async getUsageMetrics(tenantId: string) {
    const snapshot = await this.planLimitsService.getUsageSnapshot(tenantId);
    const currency = await this.resolveTenantCurrency(tenantId);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [productsCount, salesThisMonth] = await Promise.all([
      this.productModel.countDocuments({ tenantId: new Types.ObjectId(tenantId), isActive: true }),
      this.saleModel.countDocuments({
        tenantId: new Types.ObjectId(tenantId),
        type: 'sale',
        status: { $ne: 'cancelled' },
        date: { $gte: monthStart },
      }),
    ]);

    return {
      currency,
      users: snapshot.usersUsed,
      usersMax: snapshot.maxUsers,
      stores: snapshot.storesUsed,
      storesMax: snapshot.maxStores,
      products: productsCount,
      salesThisMonth,
      storageEstimateMB: 0,
      storageMaxMB: snapshot.maxStorageMB,
      usersUsed: snapshot.usersUsed,
      usersLimit: snapshot.maxUsers,
      storesUsed: snapshot.storesUsed,
      storesLimit: snapshot.maxStores,
      storageUsedMB: 0,
      storageLimitMB: snapshot.maxStorageMB,
    };
  }

  async createCheckoutSession(
    tenantId: string,
    planId: string,
    opts: { successUrl: string; cancelUrl: string; customerEmail?: string },
  ) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new BadRequestException(
        'Stripe is not configured. Use change-plan for manual upgrade.',
      );
    }

    const plan = await this.planModel.findById(planId);
    if (!plan) throw new NotFoundException('Plan not found');

    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const currentTier = normalizePlanTier(tenant.plan);
    const targetTier = normalizePlanTier(plan.name);
    const tierOrder = ['trial', 'basic', 'pro', 'enterprise'];
    const sub = await this.subscriptionModel.findOne({ tenantId });
    const needsRecovery = ['suspended', 'overdue', 'cancelled'].includes(sub?.status || '');
    if (!needsRecovery && tierOrder.indexOf(targetTier) <= tierOrder.indexOf(currentTier)) {
      throw new BadRequestException('Select a higher plan tier to upgrade.');
    }

    let currency = (await this.resolveTenantCurrency(tenantId)).toLowerCase();
    // If tenant currency is not supported by Stripe Checkout, charge in USD.
    if (!STRIPE_CHECKOUT_CURRENCIES.has(currency)) {
      currency = 'usd';
    }

    const amountCents = Math.round(roundMoney(plan.price, 2) * 100);

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', opts.successUrl);
    params.set('cancel_url', opts.cancelUrl);
    params.set('client_reference_id', tenantId);
    params.set('metadata[tenantId]', tenantId);
    params.set('metadata[planId]', planId);
    params.set('metadata[planTier]', targetTier);
    params.set('line_items[0][price_data][currency]', currency);
    params.set('line_items[0][price_data][product_data][name]', `${plan.name} Plan`);
    params.set('line_items[0][price_data][unit_amount]', String(amountCents));
    params.set('line_items[0][price_data][recurring][interval]', 'month');
    params.set('line_items[0][quantity]', '1');
    params.set('subscription_data[metadata][tenantId]', tenantId);
    params.set('subscription_data[metadata][planTier]', targetTier);

    if (opts.customerEmail) params.set('customer_email', opts.customerEmail);
    if (sub?.stripeCustomerId) params.set('customer', sub.stripeCustomerId);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      this.logger.error(`Stripe checkout error: ${session.error?.message || response.statusText}`);
      throw new BadRequestException(session.error?.message || 'Failed to create checkout session');
    }

    return { url: session.url, sessionId: session.id, currency: currency.toUpperCase() };
  }

  async createBillingPortalSession(
    tenantId: string,
    opts: { returnUrl: string },
  ): Promise<{ url: string }> {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new BadRequestException('Stripe is not configured.');
    }

    const sub = await this.subscriptionModel.findOne({ tenantId });
    if (!sub?.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer on file. Complete a paid checkout before opening the billing portal.',
      );
    }

    const params = new URLSearchParams();
    params.set('customer', sub.stripeCustomerId);
    params.set('return_url', opts.returnUrl);

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      this.logger.error(`Stripe portal error: ${session.error?.message || response.statusText}`);
      throw new BadRequestException(
        session.error?.message || 'Failed to create billing portal session',
      );
    }

    return { url: session.url };
  }

  /** Returns false if this Stripe event id was already processed (idempotent). */
  async claimStripeWebhookEvent(eventId: string, type: string): Promise<boolean> {
    try {
      await this.stripeWebhookEventModel.create({ eventId, type, processedAt: new Date() });
      return true;
    } catch (err: any) {
      if (err?.code === 11000) return false;
      throw err;
    }
  }

  async handleCheckoutCompleted(session: Record<string, any>) {
    const tenantId = session.metadata?.tenantId || session.client_reference_id;
    const planTier = session.metadata?.planTier || session.metadata?.planName;
    const planId = session.metadata?.planId;
    if (!tenantId) return;

    const plan = planId
      ? await this.planModel.findById(planId).lean()
      : await this.planModel
          .findOne({ name: new RegExp(`^${escapeRegex(String(planTier || ''))}$`, 'i') })
          .lean();

    await this.applyPlanChange(tenantId, plan?.name || planTier || 'pro', {
      actorUserId: '000000000000000000000000',
      actorName: 'Stripe Checkout',
      source: 'stripe.checkout.session.completed',
    });

    const sub = await this.subscriptionModel.findOne({ tenantId });
    if (sub) {
      if (session.customer) sub.stripeCustomerId = session.customer;
      if (session.subscription) sub.stripeSubscriptionId = session.subscription;
      sub.status = 'active';
      sub.autoRenew = true;
      await sub.save();
    }

    const currency = (session.currency || 'usd').toUpperCase();
    const amount = roundMoney((session.amount_total || 0) / 100, 2);
    if (amount > 0) {
      await this.billingInvoiceModel.create({
        tenantId: new Types.ObjectId(tenantId),
        subscriptionId: sub?._id,
        invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
        amount,
        currency,
        status: 'paid',
        description: `Stripe upgrade: ${plan?.name || planTier}`,
        planName: plan?.name || planTier,
        paymentMethod: 'stripe',
        transactionId: session.id,
        paidAt: new Date(),
        dueDate: new Date(),
      });
    }
  }

  async handleSubscriptionUpdated(stripeSub: Record<string, any>) {
    const tenantId = stripeSub.metadata?.tenantId;
    if (!tenantId) return;

    const sub = await this.subscriptionModel.findOne({ tenantId });
    if (!sub) return;

    sub.stripeSubscriptionId = stripeSub.id;
    if (stripeSub.status === 'active' || stripeSub.status === 'trialing') {
      sub.status = 'active';
      sub.overdueSince = null;
      sub.dunningNotificationsSent = [];
    } else if (stripeSub.status === 'past_due' || stripeSub.status === 'unpaid') {
      sub.status = 'overdue';
      sub.autoRenew = false;
      if (!sub.overdueSince) {
        sub.overdueSince = new Date();
      }
    } else if (stripeSub.status === 'canceled') {
      sub.status = 'cancelled';
    }
    await sub.save();
  }

  async handleSubscriptionDeleted(stripeSub: Record<string, any>) {
    const tenantId = stripeSub.metadata?.tenantId;
    if (!tenantId) return;

    const tenant = await this.tenantModel.findById(tenantId).lean();
    const previousPlan = tenant?.plan || 'pro';

    await this.applyPlanChange(tenantId, 'basic', {
      actorUserId: '000000000000000000000000',
      actorName: 'Stripe Webhook',
      source: 'stripe.customer.subscription.deleted',
    });

    const sub = await this.subscriptionModel.findOne({ tenantId });
    if (sub) {
      sub.status = 'cancelled';
      sub.autoRenew = false;
      sub.stripeSubscriptionId = '';
      await sub.save();
    }

    await this.tenantModel.findByIdAndUpdate(tenantId, {
      $set: { isActive: true },
    });

    await this.auditService.log({
      tenantId,
      userId: '000000000000000000000000',
      userName: 'Stripe Webhook',
      action: 'plan.downgrade',
      entity: 'tenant',
      entityId: tenantId,
      summary: `Subscription cancelled — downgraded from ${previousPlan} to basic`,
      before: { plan: previousPlan },
      after: { plan: 'basic' },
    });
  }

  async findTenantByStripeSubscriptionId(stripeSubscriptionId: string) {
    return this.subscriptionModel.findOne({ stripeSubscriptionId }).lean();
  }

  async markSubscriptionOverdue(tenantId: string) {
    const sub = await this.subscriptionModel.findOne({ tenantId });
    if (!sub) return;
    sub.status = 'overdue';
    sub.autoRenew = false;
    if (!sub.overdueSince) {
      sub.overdueSince = new Date();
    }
    await sub.save();
  }

  async recordPayment(tenantId: string, amount: number, method: string, transactionId: string) {
    const sub = await this.subscriptionModel.findOne({ tenantId });
    if (!sub) throw new NotFoundException('Subscription not found');

    const currency = await this.resolveTenantCurrency(tenantId);
    const now = new Date();
    const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;

    await this.billingInvoiceModel.create({
      tenantId: new Types.ObjectId(tenantId),
      subscriptionId: sub._id,
      invoiceNumber: invoiceNum,
      amount,
      currency,
      status: 'paid',
      description: `Payment for ${sub.planName}`,
      planName: sub.planName,
      paymentMethod: method,
      transactionId,
      paidAt: now,
      dueDate: now,
    });

    const renewalDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    sub.status = 'active';
    sub.renewalDate = renewalDate;
    sub.overdueSince = null;
    sub.dunningNotificationsSent = [];
    await sub.save();

    return { message: 'Payment recorded', subscription: sub, currency };
  }
}
