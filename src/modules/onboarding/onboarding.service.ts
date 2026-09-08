import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Category, CategoryDocument } from '../../database/schemas/category.schema';
import { Unit, UnitDocument } from '../../database/schemas/unit.schema';
import { PosSettings, PosSettingsDocument } from '../../database/schemas/pos-settings.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import {
  DEFAULT_STARTER_TEMPLATE,
  StarterTemplate,
} from '../../common/constants/default-starter-template';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { PLAN_DEFINITIONS } from '../../common/constants/plan-features';
import { currencyForCountry, normalizeCurrencyCode } from '../../common/utils/currency.util';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Unit.name) private unitModel: Model<UnitDocument>,
    @InjectModel(PosSettings.name) private posSettingsModel: Model<PosSettingsDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  private tid(tenantId: string) {
    return new Types.ObjectId(tenantId);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async getStatus(tenantId: string) {
    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const settings = tenant.settings || {};
    const planDef = PLAN_DEFINITIONS[tenant.plan as keyof typeof PLAN_DEFINITIONS];
    const maxStores = tenant.maxStores ?? planDef?.maxStores ?? 1;

    return {
      onboardingCompleted: settings.onboardingCompleted ?? true,
      uiMode: settings.uiMode ?? 'simple',
      catalogMode: settings.catalogMode ?? 'per_store',
      tenantName: tenant.name,
      maxStores,
      starterCategories: DEFAULT_STARTER_TEMPLATE.categories.length,
    };
  }

  async completeOnboarding(
    tenantId: string,
    storeId: string | undefined,
    dto: CompleteOnboardingDto,
  ) {
    const tenant = await this.tenantModel.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');

    const settings = { ...(tenant.settings || {}) };
    settings.onboardingCompleted = true;
    settings.uiMode = dto.uiMode;
    const currency = dto.currency ? normalizeCurrencyCode(dto.currency) : undefined;
    if (currency) settings.currency = currency;

    const baseCurrency =
      currency || currencyForCountry((settings as any).country) || (tenant as any).baseCurrency;
    const update: Record<string, unknown> = {
      settings,
      ...(baseCurrency
        ? { baseCurrency: normalizeCurrencyCode(baseCurrency), baseCurrencySource: 'owner_country' }
        : {}),
    };
    if (dto.storeName?.trim()) {
      update.name = dto.storeName.trim();
      settings.systemName = dto.storeName.trim();
    }
    if (dto.address !== undefined) settings.address = dto.address;

    await this.tenantModel.findByIdAndUpdate(tenantId, { $set: update });

    const stores = await this.storeModel
      .find({ tenantId: this.tid(tenantId), isActive: true })
      .lean();
    const primaryStore = storeId
      ? (stores.find((s) => s._id.toString() === storeId) ?? stores[0])
      : stores[0];

    if (primaryStore) {
      const storeUpdate: Record<string, unknown> = {};
      if (dto.storeName?.trim()) storeUpdate.name = dto.storeName.trim();
      if (dto.address !== undefined) storeUpdate.address = dto.address;
      if (currency) storeUpdate.currency = currency;
      if (Object.keys(storeUpdate).length) {
        await this.storeModel.findByIdAndUpdate(primaryStore._id, { $set: storeUpdate });
      }
    }

    if (dto.applyTemplate !== false) {
      await this.applyStarterTemplate(
        tenantId,
        primaryStore?._id?.toString(),
        DEFAULT_STARTER_TEMPLATE,
      );
    }

    return {
      onboardingCompleted: true,
      uiMode: dto.uiMode,
    };
  }

  async updateUiMode(tenantId: string, uiMode: 'simple' | 'advanced') {
    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const settings = { ...(tenant.settings || {}), uiMode };
    await this.tenantModel.findByIdAndUpdate(tenantId, { $set: { settings } });
    return { uiMode };
  }

  async updateCatalogMode(tenantId: string, catalogMode: 'per_store' | 'central') {
    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const planDef = PLAN_DEFINITIONS[tenant.plan as keyof typeof PLAN_DEFINITIONS];
    const maxStores = tenant.maxStores ?? planDef?.maxStores ?? 1;
    if (catalogMode === 'central' && maxStores <= 1) {
      throw new BadRequestException('Central catalog requires a plan with multiple stores');
    }

    const settings = { ...(tenant.settings || {}), catalogMode };
    await this.tenantModel.findByIdAndUpdate(tenantId, { $set: { settings } });
    return { catalogMode };
  }

  private async applyStarterTemplate(
    tenantId: string,
    storeId: string | undefined,
    template: StarterTemplate,
  ) {
    const tid = this.tid(tenantId);
    const categoryMap = new Map<string, Types.ObjectId>();

    for (const name of template.categories) {
      const slug = this.slugify(name);
      let cat = await this.categoryModel.findOne({ tenantId: tid, slug });
      if (!cat) {
        cat = await this.categoryModel.create({ name, slug, tenantId: tid });
      }
      categoryMap.set(name, cat._id as Types.ObjectId);
    }

    for (const unit of template.units) {
      const exists = await this.unitModel.findOne({ tenantId: tid, name: unit.name });
      if (!exists) {
        await this.unitModel.create({
          name: unit.name,
          abbreviation: unit.abbreviation,
          tenantId: tid,
        });
      }
    }

    if (storeId) {
      const sid = new Types.ObjectId(storeId);
      const posUpdate: Record<string, unknown> = {
        posMode: 'retail',
        defaultPosScreen: 'register',
        defaultTaxRate: template.posDefaults.defaultTaxRate ?? 0,
        receiptFooter: template.posDefaults.receiptFooter ?? '',
        paymentMethods: template.posDefaults.paymentMethods,
      };

      if (template.posDefaults.requireShift !== undefined) {
        posUpdate.requireShift = template.posDefaults.requireShift;
      }
      if (template.posDefaults.loyaltyEarnRate !== undefined) {
        posUpdate.loyaltyEarnRate = template.posDefaults.loyaltyEarnRate;
      }
      if (template.posDefaults.loyaltyRedeemRate !== undefined) {
        posUpdate.loyaltyRedeemRate = template.posDefaults.loyaltyRedeemRate;
      }

      await this.posSettingsModel.findOneAndUpdate(
        { tenantId: tid, storeId: sid, terminalId: 'default' },
        { $set: posUpdate },
        { upsert: true },
      );

      await this.seedSampleProducts(tid, sid, template, categoryMap);
    }
  }

  private async seedSampleProducts(
    tenantId: Types.ObjectId,
    storeId: Types.ObjectId,
    template: StarterTemplate,
    categoryMap: Map<string, Types.ObjectId>,
  ) {
    const existingCount = await this.productModel.countDocuments({ tenantId, storeId });
    if (existingCount > 0 || !template.sampleProducts?.length) return;

    for (const sample of template.sampleProducts) {
      const slug = this.slugify(sample.name);
      const exists = await this.productModel.findOne({ tenantId, storeId, sku: sample.sku });
      if (exists) continue;

      await this.productModel.create({
        name: sample.name,
        slug,
        sku: sample.sku,
        price: sample.price,
        stock: 100,
        categoryId: categoryMap.get(sample.category) ?? null,
        storeId,
        tenantId,
        isActive: true,
      });
    }
  }
}
