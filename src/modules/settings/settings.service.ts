import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Setting, SettingDocument } from '../../database/schemas/settings.schema';
import { Tax, TaxDocument } from '../../database/schemas/settings.schema';
import { Discount, DiscountDocument } from '../../database/schemas/settings.schema';
import { PricingRule, PricingRuleDocument } from '../../database/schemas/settings.schema';
import { PaymentMethod, PaymentMethodDocument } from '../../database/schemas/settings.schema';
import { ApiKey, ApiKeyDocument } from '../../database/schemas/settings.schema';
import { Role, RoleDocument } from '../../database/schemas/role.schema';
import {
  InvoiceCounter,
  InvoiceCounterDocument,
} from '../../database/schemas/invoice-counter.schema';
import { ExchangeRate, ExchangeRateDocument } from '../../database/schemas/exchange-rate.schema';
import {
  WebhookSubscription,
  WebhookSubscriptionDocument,
  WEBHOOK_EVENTS,
} from '../../database/schemas/webhook-subscription.schema';
import { AuditService } from '../../common/services/audit.service';
import { CurrencyBackfillService } from '../../common/services/currency-backfill.service';
import { isProOrEnterprise } from '../../common/constants/plan-features';
import { normalizeCurrencyCode } from '../../common/utils/currency.util';
import { assertPublicHttpUrl } from '../../common/utils/ssrf-guard.util';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    @InjectModel(Tax.name) private taxModel: Model<TaxDocument>,
    @InjectModel(Discount.name) private discountModel: Model<DiscountDocument>,
    @InjectModel(PricingRule.name) private pricingModel: Model<PricingRuleDocument>,
    @InjectModel(PaymentMethod.name) private payMethodModel: Model<PaymentMethodDocument>,
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(InvoiceCounter.name) private invoiceCounterModel: Model<InvoiceCounterDocument>,
    @InjectModel(ExchangeRate.name) private exchangeRateModel: Model<ExchangeRateDocument>,
    @InjectModel(WebhookSubscription.name) private webhookModel: Model<WebhookSubscriptionDocument>,
    private auditService: AuditService,
    private currencyBackfill: CurrencyBackfillService,
  ) {}

  assertAuditAccess(plan?: string) {
    if (!isProOrEnterprise(plan)) {
      throw new ForbiddenException('Audit log requires Pro or Enterprise plan.');
    }
  }

  private tid(tenantId: string) {
    return new Types.ObjectId(tenantId);
  }
  private sid(storeId: string) {
    return storeId ? new Types.ObjectId(storeId) : null;
  }

  private normalizeName(value: unknown, field = 'Name') {
    const text = String(value || '').trim();
    if (!text) throw new BadRequestException(`${field} is required`);
    return text;
  }

  private normalizePercent(value: unknown, field = 'Percent') {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number < 0 || number > 100) {
      throw new BadRequestException(`${field} must be between 0 and 100`);
    }
    return Math.round(number * 100) / 100;
  }

  private normalizeNonNegative(value: unknown, field = 'Value') {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number < 0) {
      throw new BadRequestException(`${field} cannot be negative`);
    }
    return Math.round(number * 100) / 100;
  }

  // ── Generic Settings (key-value) ──

  async getSetting(tenantId: string, storeId: string, key: string) {
    const doc = await this.settingModel
      .findOne({ tenantId: this.tid(tenantId), storeId: this.sid(storeId), key })
      .lean();
    return doc?.value || null;
  }

  async putSetting(tenantId: string, storeId: string, key: string, value: any) {
    return this.settingModel.findOneAndUpdate(
      { tenantId: this.tid(tenantId), storeId: this.sid(storeId), key },
      { $set: { value } },
      { upsert: true, new: true },
    );
  }

  // ── Exchange Rates ──

  async getExchangeRates(tenantId: string) {
    return this.exchangeRateModel
      .find({ tenantId: this.tid(tenantId) })
      .sort({ fromCurrency: 1, toCurrency: 1, effectiveAt: -1 })
      .lean();
  }

  async upsertExchangeRate(tenantId: string, dto: any) {
    const fromCurrency = normalizeCurrencyCode(dto.fromCurrency);
    const toCurrency = normalizeCurrencyCode(dto.toCurrency);
    const rate = Number(dto.rate);
    if (fromCurrency === toCurrency)
      throw new BadRequestException('Exchange rate currencies must differ');
    if (!Number.isFinite(rate) || rate <= 0)
      throw new BadRequestException('Exchange rate must be greater than zero');
    const effectiveAt = dto.effectiveAt ? new Date(dto.effectiveAt) : new Date();
    if (Number.isNaN(effectiveAt.getTime()))
      throw new BadRequestException('Invalid exchange rate date');

    const saved = await this.exchangeRateModel.findOneAndUpdate(
      { tenantId: this.tid(tenantId), fromCurrency, toCurrency, effectiveAt },
      {
        $set: {
          fromCurrency,
          toCurrency,
          rate: Math.round(rate * 1_000_000) / 1_000_000,
          effectiveAt,
          isActive: dto.isActive !== false,
          note: String(dto.note || ''),
          source: 'manual',
          tenantId: this.tid(tenantId),
        },
      },
      { upsert: true, new: true },
    );

    // Back-convert any transactions that were recorded while this rate was
    // missing, so the newly-added rate is reflected in consolidated totals
    // immediately. Never let a backfill hiccup fail the rate save.
    try {
      await this.currencyBackfill.backfillTenant(tenantId);
    } catch {
      /* backfill also runs daily via the FX scheduler */
    }

    return saved;
  }

  async deleteExchangeRate(tenantId: string, id: string) {
    return this.exchangeRateModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
  }

  // ── Tax ──

  async getTaxes(tenantId: string, storeId: string) {
    return this.taxModel
      .find({ tenantId: this.tid(tenantId), storeId: this.sid(storeId) })
      .sort({ name: 1 })
      .lean();
  }

  async createTax(tenantId: string, storeId: string, dto: any) {
    const name = this.normalizeName(dto.name, 'Tax name');
    const exists = await this.taxModel.findOne({
      tenantId: this.tid(tenantId),
      storeId: this.sid(storeId),
      name,
    });
    if (exists) throw new BadRequestException('Tax name already exists');
    return this.taxModel.create({
      ...dto,
      name,
      rate: this.normalizePercent(dto.rate, 'Tax rate'),
      tenantId: this.tid(tenantId),
      storeId: this.sid(storeId),
    });
  }

  async deleteTax(tenantId: string, id: string) {
    return this.taxModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
  }

  // ── Discounts ──

  async getDiscounts(tenantId: string, storeId: string) {
    return this.discountModel
      .find({ tenantId: this.tid(tenantId), storeId: this.sid(storeId) })
      .sort({ name: 1 })
      .lean();
  }

  async createDiscount(tenantId: string, storeId: string, dto: any) {
    const name = this.normalizeName(dto.name, 'Discount name');
    const exists = await this.discountModel.findOne({
      tenantId: this.tid(tenantId),
      storeId: this.sid(storeId),
      name,
    });
    if (exists) throw new BadRequestException('Discount name already exists');
    const value =
      dto.type === 'percentage'
        ? this.normalizePercent(dto.value, 'Discount percent')
        : this.normalizeNonNegative(dto.value, 'Discount value');
    return this.discountModel.create({
      ...dto,
      name,
      value,
      minOrderAmount: this.normalizeNonNegative(dto.minOrderAmount, 'Minimum order amount'),
      maxDiscount:
        dto.maxDiscount == null
          ? null
          : this.normalizeNonNegative(dto.maxDiscount, 'Maximum discount'),
      tenantId: this.tid(tenantId),
      storeId: this.sid(storeId),
    });
  }

  async deleteDiscount(tenantId: string, id: string) {
    return this.discountModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
  }

  // ── Pricing Rules ──

  async getPricingRules(tenantId: string, storeId: string) {
    return this.pricingModel
      .find({ tenantId: this.tid(tenantId), storeId: this.sid(storeId) })
      .sort({ priority: 1 })
      .lean();
  }

  async createPricingRule(tenantId: string, storeId: string, dto: any) {
    const name = this.normalizeName(dto.name, 'Pricing rule name');
    const exists = await this.pricingModel.findOne({
      tenantId: this.tid(tenantId),
      storeId: this.sid(storeId),
      name,
    });
    if (exists) throw new BadRequestException('Pricing rule name already exists');
    return this.pricingModel.create({
      ...dto,
      name,
      discountValue:
        dto.discountType === 'percentage'
          ? this.normalizePercent(dto.discountValue, 'Pricing discount percent')
          : this.normalizeNonNegative(dto.discountValue, 'Pricing value'),
      priority: Math.max(1, parseInt(dto.priority, 10) || 1),
      tenantId: this.tid(tenantId),
      storeId: this.sid(storeId),
    });
  }

  async deletePricingRule(tenantId: string, id: string) {
    return this.pricingModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
  }

  // ── Payment Methods ──

  async getPaymentMethods(tenantId: string, storeId: string) {
    return this.payMethodModel
      .find({ tenantId: this.tid(tenantId), storeId: this.sid(storeId) })
      .sort({ name: 1 })
      .lean();
  }

  async createPaymentMethod(tenantId: string, storeId: string, dto: any) {
    const name = this.normalizeName(dto.name, 'Payment method name');
    return this.payMethodModel.findOneAndUpdate(
      { tenantId: this.tid(tenantId), storeId: this.sid(storeId), name },
      { $set: { ...dto, name, tenantId: this.tid(tenantId), storeId: this.sid(storeId) } },
      { upsert: true, new: true },
    );
  }

  async deletePaymentMethod(tenantId: string, id: string) {
    return this.payMethodModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
  }

  // ── API Keys ──

  async getApiKeys(tenantId: string) {
    return this.apiKeyModel
      .find({ tenantId: this.tid(tenantId), isActive: true })
      .select('-keyHash')
      .sort({ createdAt: -1 })
      .lean();
  }

  async generateApiKey(
    tenantId: string,
    dto: { name: string; expiresInDays?: number },
    actor?: { userId: string; userName: string; ip?: string },
  ) {
    const name = this.normalizeName(dto.name, 'API key name');
    const days = dto.expiresInDays == null ? undefined : Number(dto.expiresInDays);
    if (days !== undefined && (!Number.isFinite(days) || days < 1 || days > 3650)) {
      throw new BadRequestException('API key expiry must be between 1 and 3650 days');
    }
    const rawKey = `sk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.slice(0, 12) + '...';
    const expiresAt = days ? new Date(Date.now() + days * 86400000) : null;

    await this.apiKeyModel.create({
      name,
      keyHash,
      prefix,
      expiresAt,
      tenantId: this.tid(tenantId),
    });

    if (actor) {
      await this.auditService.log({
        tenantId,
        userId: actor.userId,
        userName: actor.userName,
        action: 'api_key.create',
        entity: 'api_key',
        summary: `Created API key "${name}"`,
        ip: actor.ip,
      });
    }

    return { key: rawKey, prefix, expiresAt };
  }

  async revokeApiKey(
    tenantId: string,
    id: string,
    actor?: { userId: string; userName: string; ip?: string },
  ) {
    const key = await this.apiKeyModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    await this.apiKeyModel.updateOne(
      { _id: id, tenantId: this.tid(tenantId) },
      { isActive: false },
    );
    if (actor && key) {
      await this.auditService.log({
        tenantId,
        userId: actor.userId,
        userName: actor.userName,
        action: 'api_key.revoke',
        entity: 'api_key',
        entityId: id,
        summary: `Revoked API key "${key.name}"`,
        ip: actor.ip,
      });
    }
    return { message: 'API key revoked' };
  }

  // ── Roles ──

  async getRoles(tenantId: string) {
    return this.roleModel
      .find({ tenantId: this.tid(tenantId) })
      .sort({ name: 1 })
      .lean();
  }

  async createRole(
    tenantId: string,
    dto: { name: string; permissions: string[] },
    actor?: { userId: string; userName: string; ip?: string },
  ) {
    const role = await this.roleModel.create({ ...dto, tenantId: this.tid(tenantId) });
    if (actor) {
      await this.auditService.log({
        tenantId,
        userId: actor.userId,
        userName: actor.userName,
        action: 'role.create',
        entity: 'role',
        entityId: role._id.toString(),
        summary: `Created role "${dto.name}"`,
        after: { permissions: dto.permissions },
        ip: actor.ip,
      });
    }
    return role;
  }

  async updateRole(
    tenantId: string,
    id: string,
    dto: { name?: string; permissions?: string[] },
    actor?: { userId: string; userName: string; ip?: string },
  ) {
    const before = await this.roleModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    // Whitelist explicitly — the controller's @Body() is untyped (no
    // class-validator DTO on this route), so spreading dto raw into $set would
    // let a caller overwrite tenantId and reassign this role to another tenant.
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.permissions !== undefined) patch.permissions = dto.permissions;
    const updated = await this.roleModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: patch },
      { new: true },
    );
    if (actor && before) {
      await this.auditService.log({
        tenantId,
        userId: actor.userId,
        userName: actor.userName,
        action: 'role.update',
        entity: 'role',
        entityId: id,
        summary: `Updated role "${before.name}"`,
        before: { name: before.name, permissions: before.permissions },
        after: { name: updated?.name, permissions: updated?.permissions },
        ip: actor.ip,
      });
    }
    return updated;
  }

  async deleteRole(
    tenantId: string,
    id: string,
    actor?: { userId: string; userName: string; ip?: string },
  ) {
    const before = await this.roleModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    const result = await this.roleModel.deleteOne({
      _id: id,
      tenantId: this.tid(tenantId),
      name: { $ne: 'owner' },
    });
    if (actor && before) {
      await this.auditService.log({
        tenantId,
        userId: actor.userId,
        userName: actor.userName,
        action: 'role.delete',
        entity: 'role',
        entityId: id,
        summary: `Deleted role "${before.name}"`,
        ip: actor.ip,
      });
    }
    return result;
  }

  // ── Invoice Numbering ──

  async getInvoiceFormat(tenantId: string, storeId: string) {
    const setting = await this.getSetting(tenantId, storeId, 'invoice_format');
    if (setting) return setting;
    const counter = await this.invoiceCounterModel
      .findOne({
        tenantId: this.tid(tenantId),
        storeId: this.sid(storeId),
      })
      .lean();
    return {
      prefix: counter?.prefix || 'INV-',
      nextNumber: counter?.lastNumber ? counter.lastNumber + 1 : 1,
      padding: 5,
      suffix: '',
      resetPeriod: 'never',
    };
  }

  async updateInvoiceFormat(tenantId: string, storeId: string, dto: any) {
    await this.putSetting(tenantId, storeId, 'invoice_format', dto);
    if (dto.nextNumber) {
      await this.invoiceCounterModel.findOneAndUpdate(
        { tenantId: this.tid(tenantId), storeId: this.sid(storeId) },
        { $set: { lastNumber: dto.nextNumber - 1, prefix: dto.prefix || 'INV-' } },
        { upsert: true },
      );
    }
    return dto;
  }

  // ── Email config (encrypted API key) ──

  async getEmailConfig(tenantId: string, storeId: string) {
    const config = await this.getSetting(tenantId, storeId, 'email_config');
    if (!config) return null;
    if (config.apiKey) config.apiKey = '••••••••' + (config.apiKey.slice(-4) || '');
    if (config.smtpPass) config.smtpPass = '••••••••';
    return config;
  }

  async updateEmailConfig(tenantId: string, storeId: string, dto: any) {
    const existing = await this.getSetting(tenantId, storeId, 'email_config');
    const toSave = { ...dto };
    if (toSave.apiKey && toSave.apiKey.startsWith('••••')) {
      toSave.apiKey = existing?.apiKey || '';
    } else if (toSave.apiKey) {
      toSave.apiKey = this.encrypt(toSave.apiKey);
    }
    if (toSave.smtpPass && toSave.smtpPass === '••••••••') {
      toSave.smtpPass = existing?.smtpPass || '';
    } else if (toSave.smtpPass) {
      toSave.smtpPass = this.encrypt(toSave.smtpPass);
    }
    return this.putSetting(tenantId, storeId, 'email_config', toSave);
  }

  private encrypt(text: string): string {
    // No hardcoded fallback: a fixed key baked into source would let anyone with
    // repo read access decrypt every tenant's stored email/SMTP credentials from
    // a database dump. env.validation.ts requires ENCRYPTION_KEY in production;
    // this throws rather than silently reusing a known-weak key in any environment.
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new BadRequestException(
        'ENCRYPTION_KEY is not configured on this server — cannot store this credential securely.',
      );
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(key.padEnd(32, '0').slice(0, 32)),
      iv,
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // ── Webhooks (Enterprise) ──

  async getWebhooks(tenantId: string) {
    return this.webhookModel
      .find({ tenantId: this.tid(tenantId) })
      .select('-secret')
      .sort({ createdAt: -1 })
      .lean();
  }

  async createWebhook(
    tenantId: string,
    dto: { url: string; events: string[]; description?: string },
  ) {
    const events = (dto.events || []).filter((e) =>
      (WEBHOOK_EVENTS as readonly string[]).includes(e),
    ) as (typeof WEBHOOK_EVENTS)[number][];
    if (!events.length) throw new NotFoundException('Select at least one valid event');
    // Prevent SSRF: a tenant admin could otherwise register a webhook pointed
    // at an internal address (e.g. the 169.254.169.254 cloud metadata
    // endpoint) and have our server make requests to it on their behalf.
    await assertPublicHttpUrl(dto.url);
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const doc = await this.webhookModel.create({
      tenantId: this.tid(tenantId),
      url: dto.url,
      events,
      description: dto.description || '',
      secret,
      isActive: true,
    });
    return { ...doc.toObject(), secret };
  }

  async updateWebhook(
    tenantId: string,
    id: string,
    dto: { url?: string; events?: string[]; isActive?: boolean; description?: string },
  ) {
    const update: Record<string, unknown> = {};
    if (dto.url !== undefined) {
      await assertPublicHttpUrl(dto.url);
      update.url = dto.url;
    }
    if (dto.description !== undefined) update.description = dto.description;
    if (dto.isActive !== undefined) update.isActive = dto.isActive;
    if (dto.events) {
      update.events = dto.events.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    }
    const doc = await this.webhookModel
      .findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: update }, { new: true })
      .select('-secret');
    if (!doc) throw new NotFoundException('Webhook not found');
    return doc;
  }

  async deleteWebhook(tenantId: string, id: string) {
    const result = await this.webhookModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
    if (!result.deletedCount) throw new NotFoundException('Webhook not found');
    return { message: 'Webhook deleted' };
  }

  async rotateWebhookSecret(tenantId: string, id: string) {
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const doc = await this.webhookModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: { secret } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Webhook not found');
    return { secret };
  }
}
