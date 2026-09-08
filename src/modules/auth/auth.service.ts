import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { User, UserDocument } from '../../database/schemas/user.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { RefreshToken, RefreshTokenDocument } from '../../database/schemas/refresh-token.schema';
import { Role, RoleDocument, DEFAULT_ROLES_DATA } from '../../database/schemas/role.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Otp, OtpDocument } from '../../database/schemas/otp.schema';
import { Invite, InviteDocument } from '../../database/schemas/invite.schema';
import { Subscription, SubscriptionDocument } from '../../database/schemas/subscription.schema';
import { allowsBillingRecoveryAuth } from '../../common/utils/billing-recovery.util';
import { EmailService } from '../../common/services/email.service';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { isPlatformRole, getPlatformPermissions } from '../../common/constants/platform-roles';
import {
  buildTenantPlanUpdate,
  normalizePlanTier,
  resolveTenantFeatures,
  tenantHasFeatureAccess,
} from '../../common/constants/plan-features';
import {
  isTrialWindowActive,
  resolveTrialEndDate,
  shouldRepairTrialStatus,
  TRIAL_PERIOD_DAYS,
} from '../../common/utils/subscription-access.util';
import { filterStoresForUser } from '../../common/utils/store-access.util';
import { EmployeePortalSyncService } from '../hrm/employee-portal-sync.service';
import { PlanLimitsService } from '../../common/services/plan-limits.service';
import { AuditService } from '../../common/services/audit.service';
import { normalizeCurrencyCode } from '../../common/utils/currency.util';
import { secretsMatch } from '../../common/utils/secret-compare.util';

// Assignable role names (owner is excluded — assigned only at tenant creation)
const ASSIGNABLE_ROLES = DEFAULT_ROLES_DATA.filter((r) => r.isAssignable).map((r) => r.name);

const TRIAL_DAYS = TRIAL_PERIOD_DAYS;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(RefreshToken.name) private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    @InjectModel(Invite.name) private inviteModel: Model<InviteDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private employeePortalSync: EmployeePortalSyncService,
    private planLimitsService: PlanLimitsService,
    private auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Merge role permissions + user-level overrides into one deduplicated array. */
  private async getEffectivePermissions(user: UserDocument): Promise<string[]> {
    if (user.role === 'super_admin' || user.role === 'owner') return ['*'];
    if (!user.tenantId && isPlatformRole(user.role)) {
      return getPlatformPermissions(user.role);
    }
    if (!user.tenantId) return [];

    const roleDoc = await this.roleModel
      .findOne({ tenantId: user.tenantId, name: user.role })
      .lean<{ permissions: string[] }>();

    const rolePermissions: string[] =
      roleDoc?.permissions ??
      DEFAULT_ROLES_DATA.find((r) => r.name === user.role)?.permissions ??
      [];
    const userPermissions: string[] = user.permissions ?? [];

    return [...new Set([...rolePermissions, ...userPermissions])];
  }

  private toTenantId(tenantId: unknown): string | undefined {
    if (tenantId == null) return undefined;
    return String(tenantId);
  }

  /** Resolved plan + feature modules for a tenant; empty for super-admin or missing tenant. */
  private async getTenantPlanContext(
    tenantId: unknown,
  ): Promise<{ plan: string; featureAccess: string[] }> {
    const id = this.toTenantId(tenantId);
    if (!id) return { plan: 'basic', featureAccess: [] };
    const tenant = await this.tenantModel
      .findById(id)
      .lean<{ plan?: string; featureAccess?: string[] }>();
    const plan = normalizePlanTier(tenant?.plan);
    return {
      plan,
      featureAccess: resolveTenantFeatures(plan, tenant?.featureAccess),
    };
  }

  private async getTenantFeatureAccess(tenantId: unknown): Promise<string[]> {
    const ctx = await this.getTenantPlanContext(tenantId);
    return ctx.featureAccess;
  }

  /** Generate a unique subdomain from a human-readable name. */
  private async generateSubdomain(base: string): Promise<string> {
    const slug =
      base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'store';
    let candidate = slug;
    let counter = 1;
    while (await this.tenantModel.exists({ subdomain: candidate })) {
      candidate = `${slug}-${counter++}`;
    }
    return candidate;
  }

  /** Seed all DEFAULT_ROLES_DATA into a tenant's role collection. */
  private async seedRolesForTenant(tenantId: Types.ObjectId): Promise<void> {
    await this.roleModel.insertMany(
      DEFAULT_ROLES_DATA.map((r) => ({
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        isSystem: r.isSystem,
        isAssignable: r.isAssignable,
        level: r.level,
        tenantId,
      })),
    );
  }

  /** Create a trial subscription for a new tenant (uses tenant end date when set). */
  private async createTrialSubscription(
    tenantId: Types.ObjectId,
    trialEndOverride?: Date,
  ): Promise<void> {
    const now = new Date();
    const trialEnd = trialEndOverride ?? new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await this.subscriptionModel.create({
      tenantId,
      planId: new Types.ObjectId(),
      planName: 'Trial',
      price: 0,
      status: 'trial',
      billingCycle: 'monthly',
      startDate: now,
      renewalDate: trialEnd,
      trialEndsAt: trialEnd,
      autoRenew: false,
    });
  }

  /** Ensure subscription row exists and reflects an active trial when applicable. */
  private async ensureSubscriptionForTenant(
    tenantId: Types.ObjectId,
    tenant?: {
      plan?: string;
      subscriptionEndDate?: Date;
      subscriptionStartDate?: Date;
    } | null,
  ): Promise<void> {
    const existing = await this.subscriptionModel.findOne({ tenantId }).lean();
    const trialEnd = tenant?.subscriptionEndDate
      ? new Date(tenant.subscriptionEndDate)
      : new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    if (!existing) {
      if (normalizePlanTier(tenant?.plan) === 'trial') {
        await this.createTrialSubscription(tenantId, trialEnd);
      }
      return;
    }

    const tier = normalizePlanTier(tenant?.plan);
    const repair = shouldRepairTrialStatus(existing, tenant);
    const patch: Record<string, unknown> = {};

    if (repair) {
      patch.status = 'trial';
    }

    if (tier !== 'trial' && ['suspended', 'overdue', 'cancelled'].includes(existing.status || '')) {
      patch.status = 'active';
      patch.trialEndsAt = null;
    }

    if (!existing.trialEndsAt && tenant?.subscriptionEndDate) {
      patch.trialEndsAt = tenant.subscriptionEndDate;
      patch.renewalDate = tenant.subscriptionEndDate;
    }

    if (Object.keys(patch).length > 0) {
      await this.subscriptionModel.updateOne({ tenantId }, { $set: patch });
      if (repair || tier !== 'trial') {
        await this.tenantModel.updateOne({ _id: tenantId }, { $set: { isActive: true } });
      }
    }
  }

  /** Subscription snapshot for auth responses and /auth/me. */
  private async getSubscriptionSummary(tenantId: unknown): Promise<{
    status: string;
    trialEndsAt?: Date | null;
    subscriptionEndDate?: Date | null;
    planName?: string;
  } | null> {
    const id = this.toTenantId(tenantId);
    if (!id) return null;

    const tenant = await this.tenantModel
      .findById(id)
      .select('subscriptionEndDate subscriptionStartDate plan')
      .lean<{ subscriptionEndDate?: Date; subscriptionStartDate?: Date; plan?: string }>();

    await this.ensureSubscriptionForTenant(new Types.ObjectId(id), tenant);

    const sub = await this.subscriptionModel
      .findOne({ tenantId: id })
      .select('status trialEndsAt subscriptionEndDate planName renewalDate')
      .lean<{
        status: string;
        trialEndsAt?: Date;
        subscriptionEndDate?: Date;
        planName?: string;
        renewalDate?: Date;
      }>();

    if (sub) {
      const trialEndsAt = resolveTrialEndDate(sub, tenant);
      const status =
        isTrialWindowActive(sub, tenant) && sub.status !== 'active' ? 'trial' : sub.status;

      return {
        status,
        trialEndsAt,
        subscriptionEndDate: sub.subscriptionEndDate ?? tenant?.subscriptionEndDate ?? null,
        planName: sub.planName,
      };
    }

    if (!tenant?.subscriptionEndDate) return null;

    const tier = normalizePlanTier(tenant.plan) === 'trial' ? 'trial' : 'active';
    const trialEndsAt = resolveTrialEndDate(null, tenant);
    return {
      status: tier,
      trialEndsAt: tier === 'trial' ? trialEndsAt : null,
      subscriptionEndDate: tenant.subscriptionEndDate,
      planName: tenant.plan || 'trial',
    };
  }

  /** Build the JWT payload, including resolved effectivePermissions and tenant features. */
  private async buildJwtPayload(user: UserDocument): Promise<Record<string, unknown>> {
    const [effectivePermissions, planContext] = await Promise.all([
      this.getEffectivePermissions(user),
      this.getTenantPlanContext(user.tenantId),
    ]);
    return {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tenantId: user.tenantId ? user.tenantId.toString() : '',
      plan: planContext.plan,
      permissions: user.permissions ?? [],
      effectivePermissions,
      featureAccess: planContext.featureAccess,
      storeAccess: (user.storeAccess ?? []).map((id) => id.toString()),
      tokenVersion: user.tokenVersion ?? 0,
    };
  }

  private async generateTokens(
    user: UserDocument,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = await this.buildJwtPayload(user);
    const accessToken = this.jwtService.sign(payload);

    const refreshTokenValue = crypto.randomBytes(40).toString('hex');
    const refreshExpStr = this.configService.get<string>('JWT_REFRESH_EXPIRATION') ?? '7d';
    const refreshExpDays = parseInt(refreshExpStr.replace('d', ''), 10) || 7;

    await this.refreshTokenModel.create({
      userId: user._id,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + refreshExpDays * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  /** Strip sensitive fields before returning user to the client. */
  private sanitizeUser(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId ? user.tenantId.toString() : '',
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      picture: user.picture ?? '',
      permissions: user.permissions ?? [],
      storeAccess: (user.storeAccess ?? []).map((id) => id.toString()),
    };
  }

  private async getTenantSettings(tenantId: unknown) {
    const id = this.toTenantId(tenantId);
    if (!id) {
      return {
        onboardingCompleted: true,
        uiMode: 'simple' as const,
        defaultLocale: 'en',
        currencyConfig: null,
        tenantName: null,
      };
    }
    const tenant = await this.tenantModel.findById(id).lean<{
      settings?: {
        onboardingCompleted?: boolean;
        uiMode?: string;
        catalogMode?: string;
        defaultLocale?: string;
        currency?: string;
      };
      maxStores?: number;
      plan?: string;
      name?: string;
    }>();
    const settings = tenant?.settings || {};
    const currencyCode = settings.currency || 'USD';
    return {
      onboardingCompleted: settings.onboardingCompleted ?? true,
      uiMode: (settings.uiMode === 'advanced' ? 'advanced' : 'simple') as 'simple' | 'advanced',
      catalogMode: (settings.catalogMode === 'central' ? 'central' : 'per_store') as
        'per_store' | 'central',
      maxStores: tenant?.maxStores ?? 1,
      tenantName: tenant?.name ?? null,
      defaultLocale: settings.defaultLocale || 'en',
      currencyConfig: {
        code: currencyCode,
        symbol: currencyCode === 'EUR' ? '€' : currencyCode === 'GBP' ? '£' : '$',
        position: 'before',
        decimalPlaces: 2,
        thousandSeparator: ',',
        decimalSeparator: '.',
      },
    };
  }

  /** Build the standard authenticated response shape. */
  private async buildAuthResponse(user: UserDocument) {
    const allStores = await this.getStoresForTenant(user.tenantId);
    const stores = filterStoresForUser(allStores, this.sanitizeUser(user));

    const [tokens, planContext, effectivePermissions, tenantSettings, subscription] =
      await Promise.all([
        this.generateTokens(user),
        this.getTenantPlanContext(user.tenantId),
        this.getEffectivePermissions(user),
        this.getTenantSettings(user.tenantId),
        this.getSubscriptionSummary(user.tenantId),
      ]);

    return {
      user: {
        ...this.sanitizeUser(user),
        plan: planContext.plan,
        effectivePermissions,
        featureAccess: planContext.featureAccess,
        subscriptionStatus: subscription?.status ?? null,
        trialEndsAt: subscription?.trialEndsAt ?? subscription?.subscriptionEndDate ?? null,
        subscriptionPlanName: subscription?.planName ?? null,
        ...tenantSettings,
      },
      stores,
      featureAccess: planContext.featureAccess,
      plan: planContext.plan,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  async tenantHasFeature(tenantId: string, feature: string): Promise<boolean> {
    if (!tenantId) return false;
    const tenant = await this.tenantModel
      .findById(tenantId)
      .lean<{ plan?: string; featureAccess?: string[] }>();
    if (!tenant) return false;
    return tenantHasFeatureAccess(tenant.plan, tenant.featureAccess, feature);
  }

  async signup(dto: SignupDto) {
    const existingUser = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existingUser) throw new ConflictException('A user with this email already exists');

    const tenantName = dto.tenantName?.trim() || `${dto.fullName.trim()}'s Store`;
    const subdomain = await this.generateSubdomain(tenantName);

    const tenant = await this.tenantModel.create({
      name: tenantName,
      subdomain,
      isActive: true,
      ...buildTenantPlanUpdate('trial'),
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      baseCurrency: normalizeCurrencyCode('USD'),
      baseCurrencySource: 'legacy',
      settings: { onboardingCompleted: false, uiMode: 'simple' },
    });

    await this.createTrialSubscription(tenant._id as Types.ObjectId);
    await this.seedRolesForTenant(tenant._id as Types.ObjectId);

    const newStore = await this.storeModel.create({
      name: 'Main Store',
      code: 'MAIN',
      address: '',
      currency: normalizeCurrencyCode('USD'),
      tenantId: tenant._id,
      isActive: true,
    });

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      fullName: dto.fullName,
      tenantId: tenant._id,
      role: 'owner',
      permissions: [],
      isActive: true,
      emailVerified: false,
      storeAccess: [newStore._id],
    });

    await this.sendOtpEmail(dto.email.toLowerCase());

    return {
      message: 'Verification OTP sent to your email. Please verify to complete signup.',
      email: dto.email.toLowerCase(),
      userId: user._id.toString(),
    };
  }

  async sendOtpEmail(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.otpModel.deleteMany({ email: normalizedEmail });
    await this.otpModel.create({ email: normalizedEmail, code, expiresAt, verified: false });
    await this.emailService.sendOtpCode(normalizedEmail, code);
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.otpModel.deleteMany({ email: normalizedEmail });
    await this.otpModel.create({ email: normalizedEmail, code, expiresAt, verified: false });
    await this.emailService.sendPasswordResetOtp(normalizedEmail, code);
  }

  /**
   * Validates an OTP guess against the single active challenge for this email,
   * tracking wrong attempts independently of source IP.
   *
   * The prior implementation matched `{email, code}` directly, so a wrong guess
   * matched no document at all and there was nothing to count against — only
   * the global per-IP @Throttle on the controller routes protected these
   * endpoints. A distributed attacker (many IPs) could brute-force a 6-digit
   * code within its 10-minute expiry window. This looks up the challenge by
   * email alone, counts wrong guesses on it via an atomic $inc, and
   * invalidates it after MAX_OTP_ATTEMPTS regardless of which IPs the guesses
   * came from — mirroring the account-level lockout login already has.
   */
  private static readonly MAX_OTP_ATTEMPTS = 5;

  private async consumeOtp(normalizedEmail: string, code: string): Promise<OtpDocument> {
    const otpRecord = await this.otpModel.findOne({
      email: normalizedEmail,
      expiresAt: { $gt: new Date() },
      verified: false,
    });
    if (!otpRecord) throw new BadRequestException('Invalid or expired OTP');

    if (otpRecord.attempts >= AuthService.MAX_OTP_ATTEMPTS) {
      await this.otpModel.deleteMany({ email: normalizedEmail });
      throw new BadRequestException('Too many incorrect attempts. Please request a new code.');
    }

    if (otpRecord.code !== code) {
      await this.otpModel.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
      throw new BadRequestException('Invalid or expired OTP');
    }

    return otpRecord;
  }

  async verifyOtpAndLogin(dto: VerifyOtpDto) {
    const normalizedEmail = dto.email.toLowerCase();
    await this.consumeOtp(normalizedEmail, dto.code);

    const user = await this.userModel.findOne({ email: normalizedEmail });
    if (!user) throw new BadRequestException('User not found. Please sign up first.');

    const wasUnverified = !user.emailVerified;
    if (wasUnverified) {
      user.emailVerified = true;
      await user.save();
      await this.emailService.sendWelcome(user.email, user.fullName).catch(() => {});
    }

    await this.otpModel.deleteMany({ email: normalizedEmail });

    return this.buildAuthResponse(user);
  }

  async resendOtp(email: string) {
    const normalizedEmail = email.toLowerCase();
    const user = await this.userModel.findOne({ email: normalizedEmail });
    if (!user) throw new BadRequestException('User not found');
    if (user.emailVerified) throw new BadRequestException('Email already verified. Please log in.');
    await this.sendOtpEmail(normalizedEmail);
    return { message: 'New OTP sent to your email.' };
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.toLowerCase();
    const user = await this.userModel.findOne({ email: normalizedEmail });
    // Always return the same message to prevent email enumeration
    if (user) await this.sendPasswordResetEmail(normalizedEmail);

    const response: { message: string } = {
      message: 'If that email exists, we have sent a reset code.',
    };

    return response;
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const normalizedEmail = email.toLowerCase();
    await this.consumeOtp(normalizedEmail, otp);

    const user = await this.userModel.findOne({ email: normalizedEmail });
    if (!user) throw new BadRequestException('User not found');

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    await this.otpModel.deleteMany({ email: normalizedEmail });

    return { message: 'Password reset successful. You can now log in.' };
  }

  /** Emergency unlock when locked out (requires ADMIN_SECRET). */
  async unlockAccount(email: string, adminSecret: string) {
    const secret = this.configService.get<string>('ADMIN_SECRET');
    if (!secretsMatch(adminSecret, secret)) {
      throw new UnauthorizedException('Invalid admin secret key');
    }

    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) throw new BadRequestException('User not found');

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    return { message: 'Account unlocked successfully. You can log in now.' };
  }

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new BadRequestException('User not found');
    const sanitized = this.sanitizeUser(user);
    const allStores = await this.getStoresForTenant(user.tenantId);
    const stores = filterStoresForUser(allStores, sanitized);
    const [planContext, effectivePermissions, tenantSettings, subscription] = await Promise.all([
      this.getTenantPlanContext(user.tenantId),
      this.getEffectivePermissions(user),
      this.getTenantSettings(user.tenantId),
      this.getSubscriptionSummary(user.tenantId),
    ]);
    return {
      ...sanitized,
      plan: planContext.plan,
      stores,
      featureAccess: planContext.featureAccess,
      effectivePermissions,
      subscriptionStatus: subscription?.status ?? null,
      trialEndsAt: subscription?.trialEndsAt ?? subscription?.subscriptionEndDate ?? null,
      subscriptionPlanName: subscription?.planName ?? null,
      ...tenantSettings,
    };
  }

  async updateProfile(userId: string, dto: { fullName?: string; picture?: string }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new BadRequestException('User not found');
    if (dto.fullName) user.fullName = dto.fullName;
    if (dto.picture !== undefined) {
      if (dto.picture.length > 600_000) {
        throw new BadRequestException(
          'Profile image is too large. Use a smaller photo (under 400KB).',
        );
      }
      user.picture = dto.picture;
    }
    await user.save();
    return { message: 'Profile updated', user: this.sanitizeUser(user) };
  }

  async adminSignup(dto: { name: string; email: string; password: string; adminSecret: string }) {
    const secret = this.configService.get<string>('ADMIN_SECRET');
    if (!secretsMatch(dto.adminSecret, secret))
      throw new UnauthorizedException('Invalid admin secret key');

    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existing) throw new ConflictException('A user with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      fullName: dto.name,
      role: 'super_admin',
      permissions: [],
      isActive: true,
      emailVerified: true,
    });

    return { message: 'Admin account created successfully' };
  }

  async validateUser(email: string, password: string): Promise<UserDocument | null> {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash');
    if (!user) return null;

    if (user.lockUntil) {
      if (user.lockUntil > new Date()) {
        const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60_000);
        throw new HttpException(
          `Account is temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s), use Forgot password, or contact support.`,
          423,
        );
      }
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    }

    if (!user.passwordHash) return null;

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();
      return null;
    }

    if ((user.failedLoginAttempts ?? 0) > 0) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    }

    return user;
  }

  async login(user: UserDocument) {
    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email first. OTP sent to your inbox.');
    }
    if (user.isActive === false) {
      const canRecoverBilling = await allowsBillingRecoveryAuth(this.subscriptionModel, user);
      if (!canRecoverBilling) {
        throw new UnauthorizedException('Your account is inactive. Contact your administrator.');
      }
    }
    return this.buildAuthResponse(user);
  }

  async handleGoogleAuth(googleUser: {
    email: string;
    fullName: string;
    googleId: string;
    picture: string;
  }) {
    let user = await this.userModel.findOne({ email: googleUser.email.toLowerCase() });

    if (user) {
      // Link Google account if not already linked
      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        user.picture = googleUser.picture;
        user.emailVerified = true;
        await user.save();
      }
      return this.buildAuthResponse(user);
    }

    // New user via Google — create tenant + roles + store + user in sequence
    const subdomain = await this.generateSubdomain(googleUser.fullName);

    const tenant = await this.tenantModel.create({
      name: `${googleUser.fullName}'s Business`,
      subdomain,
      isActive: true,
      ...buildTenantPlanUpdate('trial'),
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      baseCurrency: normalizeCurrencyCode('USD'),
      baseCurrencySource: 'legacy',
      settings: { onboardingCompleted: false, uiMode: 'simple' },
    });

    await this.createTrialSubscription(tenant._id as Types.ObjectId);
    await this.seedRolesForTenant(tenant._id as Types.ObjectId);

    const newStore = await this.storeModel.create({
      name: 'Main Store',
      code: 'MAIN',
      address: '',
      currency: normalizeCurrencyCode('USD'),
      tenantId: tenant._id,
      isActive: true,
    });

    user = await this.userModel.create({
      email: googleUser.email.toLowerCase(),
      passwordHash: '',
      fullName: googleUser.fullName,
      tenantId: tenant._id,
      role: 'owner',
      permissions: [],
      isActive: true,
      emailVerified: true,
      googleId: googleUser.googleId,
      picture: googleUser.picture,
      storeAccess: [newStore._id],
    });

    return this.buildAuthResponse(user);
  }

  async inviteTeamMember(
    tenantId: string,
    invitedBy: string,
    dto: {
      email: string;
      role: string;
      permissions?: string[];
      storeAccess?: string[];
      fullName?: string;
    },
  ) {
    if (!tenantId) throw new BadRequestException('Tenant ID is required');

    const tenant = await this.tenantModel.findById(tenantId);
    if (!tenant) throw new BadRequestException('Tenant not found');

    await this.planLimitsService.assertCanAddUser(tenantId);

    if (!ASSIGNABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException(
        `Invalid role. Assignable roles: ${ASSIGNABLE_ROLES.join(', ')}`,
      );
    }

    const existingUser = await this.userModel.findOne({ email: dto.email.toLowerCase(), tenantId });
    if (existingUser) throw new ConflictException('This user is already part of your organization');

    // Resolve permissions: use explicit overrides or fall back to role defaults
    const roleDefaults = DEFAULT_ROLES_DATA.find((r) => r.name === dto.role)?.permissions ?? [];
    const customPermissions =
      dto.permissions && dto.permissions.length > 0 ? dto.permissions : roleDefaults;

    const tempPassword = crypto.randomBytes(6).toString('hex') + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const token = crypto.randomBytes(32).toString('hex');
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    await this.inviteModel.create({
      email: dto.email.toLowerCase(),
      role: dto.role,
      tenantId,
      tenantName: tenant.name,
      invitedBy,
      passwordHash,
      token,
      customPermissions,
      storeAccess: dto.storeAccess ?? [],
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await this.emailService.sendInvite(dto.email, {
      tenantName: tenant.name,
      invitedBy,
      role: dto.role,
      tempPassword,
      acceptUrl: `${frontendUrl}/invite/accept?token=${token}`,
    });

    return { message: `Invitation sent to ${dto.email}` };
  }

  async acceptInvite(token: string) {
    const invite = await this.inviteModel
      .findOne({
        token,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      })
      .select('+passwordHash');
    if (!invite) throw new BadRequestException('Invalid or expired invitation');
    if (!invite.tenantId) throw new BadRequestException('Invalid invitation: tenant not found');

    let passwordHash = invite.passwordHash;
    // Legacy invites may still have plaintext tempPassword until they expire
    if (!passwordHash && (invite as unknown as { tempPassword?: string }).tempPassword) {
      passwordHash = await bcrypt.hash(
        (invite as unknown as { tempPassword: string }).tempPassword,
        12,
      );
    }
    if (!passwordHash) throw new BadRequestException('Invalid invitation: password not set');
    const customPermissions: string[] = (invite as any).customPermissions ?? [];
    const storeAccess: string[] = (invite as any).storeAccess ?? [];
    const fallbackName = invite.email.split('@')[0];

    let user = await this.userModel.findOne({ email: invite.email });

    if (!user) {
      user = await this.userModel.create({
        email: invite.email,
        passwordHash,
        fullName: fallbackName,
        tenantId: invite.tenantId,
        role: invite.role,
        permissions: customPermissions,
        storeAccess,
        isActive: true,
        emailVerified: true,
      });
    } else {
      if (user.tenantId && user.tenantId.toString() === invite.tenantId.toString()) {
        throw new ConflictException('You are already part of this organization');
      }
      const updated = await this.userModel.findByIdAndUpdate(
        user._id,
        {
          $set: {
            tenantId: invite.tenantId,
            role: invite.role,
            passwordHash,
            permissions: customPermissions,
            storeAccess,
            isActive: true,
            emailVerified: true,
            ...(user.fullName ? {} : { fullName: fallbackName }),
          },
        },
        { new: true, runValidators: true },
      );
      if (!updated) throw new BadRequestException('Failed to update user');
      user = updated;
    }

    invite.status = 'accepted';
    await invite.save();

    try {
      await this.employeePortalSync.ensureEmployeeForUser({
        tenantId: invite.tenantId.toString(),
        userId: user._id as Types.ObjectId,
        email: user.email,
        fullName: user.fullName,
        storeAccess: storeAccess.map((id) => id.toString()),
      });
    } catch (err) {
      // Non-fatal: portal account exists even if HRM sync fails
      this.logger.error(
        'HRM employee sync failed during invite acceptance',
        err instanceof Error ? err.stack : err,
      );
    }

    return this.buildAuthResponse(user);
  }

  async getInvites(tenantId: string) {
    return this.inviteModel
      .find({ tenantId })
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();
  }

  async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user) throw new BadRequestException('User not found');

    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required');
      }
      const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!isMatch) throw new BadRequestException('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    await this.refreshTokenModel.deleteMany({ userId: user._id });
    return { message: 'Password changed successfully' };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token not provided');

    const stored = await this.refreshTokenModel.findOne({ token: refreshToken });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userModel.findById(stored.userId);
    if (!user) throw new UnauthorizedException('User not found or inactive');

    const canRecover = await allowsBillingRecoveryAuth(this.subscriptionModel, user);
    if (!user.isActive && !canRecover) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Re-resolve permissions on every refresh so revocations take effect immediately
    const payload = await this.buildJwtPayload(user);
    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }

  async logout(refreshToken: string): Promise<void> {
    if (refreshToken) await this.refreshTokenModel.deleteOne({ token: refreshToken });
  }

  async getStoresForTenant(tenantId: unknown) {
    const id = this.toTenantId(tenantId);
    if (!id) return [];
    const stores = await this.storeModel
      .find({ tenantId: id, isActive: true }, { name: 1, code: 1, address: 1 })
      .lean();
    return stores.map((s) => ({
      _id: s._id.toString(),
      name: s.name,
      code: s.code,
      address: s.address,
    }));
  }

  /**
   * Called on application boot — ensures every tenant has all current default roles.
   * Uses upsert so it never duplicates existing roles.
   */
  async syncDefaultRoles(): Promise<void> {
    const tenants = await this.tenantModel.find({}).lean();
    for (const tenant of tenants) {
      for (const roleDef of DEFAULT_ROLES_DATA) {
        await this.roleModel.updateOne(
          { name: roleDef.name, tenantId: tenant._id },
          {
            $set: {
              description: roleDef.description,
              isSystem: roleDef.isSystem,
              isAssignable: roleDef.isAssignable,
              level: roleDef.level,
            },
            $setOnInsert: { permissions: roleDef.permissions },
          },
          { upsert: true },
        );
      }
    }
  }
}
