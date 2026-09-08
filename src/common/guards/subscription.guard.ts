import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription.decorator';
import { Subscription, SubscriptionDocument } from '../../database/schemas/subscription.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { normalizePlanTier } from '../constants/plan-features';
import {
  isTrialWindowActive,
  resolveTrialEndDate,
  shouldRepairTrialStatus,
} from '../utils/subscription-access.util';

/** How long (ms) to cache a subscription status per tenant before re-querying. */
const CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry {
  status: string;
  trialEndsAt?: Date | null;
  subscriptionEndDate?: Date | null;
  cachedAt: number;
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  /** In-process cache: tenantId → subscription snapshot. */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private reflector: Reflector,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Unauthenticated requests are handled by JwtAuthGuard — not our concern
    if (!user) return true;

    // @Public() routes skip subscription checks
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skipSubscription = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipSubscription) return true;

    // super_admin is platform-level — no tenant subscription applies
    if (user.role === 'super_admin') return true;

    const tenantId = user.tenantId as string;
    if (!tenantId) return true;

    const entry = await this.getSubscriptionEntry(tenantId);

    if (!entry) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: 'No active subscription found. Please upgrade to continue.',
          code: 'SUBSCRIPTION_REQUIRED',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const now = new Date();

    if (entry.status === 'active') {
      const expiryDate = entry.subscriptionEndDate;
      if (expiryDate && now > new Date(expiryDate)) {
        this.cache.delete(tenantId);
        throw this.paymentRequired(
          'Your subscription has expired. Please renew to continue.',
          'SUBSCRIPTION_EXPIRED',
        );
      }
      return true;
    }

    if (entry.status === 'trial') {
      const expiryDate = entry.trialEndsAt ?? entry.subscriptionEndDate;
      if (!expiryDate) {
        // Missing end date on an active trial tenant — allow (auth layer will repair).
        return true;
      }
      if (now > new Date(expiryDate)) {
        this.cache.delete(tenantId);
        throw this.paymentRequired(
          'Your trial has expired. Please upgrade to continue.',
          'TRIAL_EXPIRED',
        );
      }
      return true;
    }

    if (entry.status === 'suspended' || entry.status === 'overdue') {
      throw this.paymentRequired(
        'Your subscription is suspended due to a billing issue. Please update your payment details.',
        'SUBSCRIPTION_SUSPENDED',
      );
    }

    if (entry.status === 'cancelled') {
      throw this.paymentRequired(
        'Your subscription has been cancelled. Please reactivate to continue.',
        'SUBSCRIPTION_CANCELLED',
      );
    }

    throw this.paymentRequired(
      'Your subscription is not active. Please upgrade to continue.',
      'SUBSCRIPTION_INACTIVE',
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private paymentRequired(message: string, code: string): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message,
        code,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private async getSubscriptionEntry(tenantId: string): Promise<CacheEntry | null> {
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached;
    }

    const tenant = await this.tenantModel
      .findById(tenantId)
      .select('subscriptionEndDate plan')
      .lean<{ subscriptionEndDate?: Date; plan?: string }>();

    const sub = await this.subscriptionModel
      .findOne({ tenantId })
      .select('status trialEndsAt subscriptionEndDate renewalDate')
      .lean<
        Pick<SubscriptionDocument, 'status' | 'trialEndsAt' | 'subscriptionEndDate' | 'renewalDate'>
      >();

    const tier = normalizePlanTier(tenant?.plan);

    // Paid plan on tenant — grant access even if subscription row is stale.
    if (tier !== 'trial') {
      const entry: CacheEntry = {
        status: 'active',
        trialEndsAt: null,
        subscriptionEndDate: sub?.subscriptionEndDate ?? tenant?.subscriptionEndDate ?? null,
        cachedAt: Date.now(),
      };
      this.cache.set(tenantId, entry);
      return entry;
    }

    if (sub) {
      if (shouldRepairTrialStatus(sub, tenant)) {
        await this.subscriptionModel.updateOne({ tenantId }, { $set: { status: 'trial' } });
        sub.status = 'trial';
      }

      const trialEndsAt = resolveTrialEndDate(sub, tenant);
      const entry: CacheEntry = {
        status: isTrialWindowActive(sub, tenant) ? 'trial' : sub.status,
        trialEndsAt,
        subscriptionEndDate: sub.subscriptionEndDate ?? tenant?.subscriptionEndDate ?? null,
        cachedAt: Date.now(),
      };
      this.cache.set(tenantId, entry);
      return entry;
    }

    // Legacy tenants: fall back to tenant.subscriptionEndDate
    if (!tenant?.subscriptionEndDate) return null;

    const trialEndsAt = resolveTrialEndDate(null, tenant);
    const entry: CacheEntry = {
      status: 'trial',
      trialEndsAt,
      subscriptionEndDate: tenant.subscriptionEndDate,
      cachedAt: Date.now(),
    };
    this.cache.set(tenantId, entry);
    return entry;
  }
}
