import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { EmailService } from '../../common/services/email.service';
import { PlanLimitsService } from '../../common/services/plan-limits.service';
import { AuditService } from '../../common/services/audit.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { filterStoresForUser } from '../../common/utils/store-access.util';
import { normalizeCurrencyCode } from '../../common/utils/currency.util';

function isValidObjectId(id: any): boolean {
  return typeof id === 'string' && id.length > 0 && Types.ObjectId.isValid(id);
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStoreCode(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
}

function normalizeDefaultWarehouse(value: unknown): Types.ObjectId | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
    throw new BadRequestException('Default warehouse must be a valid warehouse id');
  }
  return new Types.ObjectId(value);
}

export const ALLOWED_LOCALES = [
  'en',
  'ar',
  'de',
  'es',
  'fr',
  'hi',
  'ja',
  'pt',
  'ur',
  'zh',
] as const;
export type AllowedLocale = (typeof ALLOWED_LOCALES)[number];

function normalizeLocale(locale: unknown): AllowedLocale {
  const code = typeof locale === 'string' ? locale : 'en';
  return (ALLOWED_LOCALES as readonly string[]).includes(code) ? (code as AllowedLocale) : 'en';
}

@Injectable()
export class TenantService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    private emailService: EmailService,
    private planLimitsService: PlanLimitsService,
    private auditService: AuditService,
  ) {}

  async getStores(tenantId: string) {
    if (!isValidObjectId(tenantId)) return [];

    const stores = await this.storeModel.find(
      { tenantId: new Types.ObjectId(tenantId), isActive: true },
      { name: 1, code: 1, address: 1, currency: 1 },
    );
    return stores.map((s) => ({
      _id: s._id.toString(),
      name: s.name,
      code: s.code,
      address: s.address,
      currency: s.currency,
    }));
  }

  /** Stores visible to the current user (owners/admins see all; staff see storeAccess only). */
  async getStoresForUser(tenantId: string, user: { role?: string; storeAccess?: string[] }) {
    const all = await this.getStores(tenantId);
    return filterStoresForUser(all, user);
  }

  async getStoresFull(tenantId: string) {
    if (!isValidObjectId(tenantId)) return [];
    return this.storeModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async createStore(
    tenantId: string,
    data: CreateStoreDto,
    actor?: { email?: string; fullName?: string },
  ) {
    if (!isValidObjectId(tenantId)) {
      throw new BadRequestException('A tenant is required to create stores');
    }

    await this.planLimitsService.assertCanAddStore(tenantId);

    const nameStr = normalizeOptionalString(data.name);
    if (!nameStr) {
      throw new BadRequestException('Store name is required');
    }
    const code = normalizeStoreCode(data.code || nameStr) || `store-${Date.now()}`;

    const existing = await this.storeModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      code,
    });
    if (existing) throw new BadRequestException('Store with this code already exists');

    const store = await this.storeModel.create({
      name: nameStr,
      code,
      address: normalizeOptionalString(data.address),
      phone: normalizeOptionalString(data.phone),
      currency: normalizeCurrencyCode(String(data.currency || 'USD')),
      defaultWarehouse: normalizeDefaultWarehouse(data.defaultWarehouse) ?? null,
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    });

    const tenant = await this.tenantModel.findById(tenantId).lean();
    const owners = await this.userModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        role: { $in: ['owner', 'admin'] },
        isActive: true,
      })
      .select('email')
      .lean();
    const recipients = [
      ...new Set([actor?.email, ...owners.map((u) => u.email)].filter(Boolean) as string[]),
    ];
    const payload = {
      storeName: nameStr,
      storeCode: code,
      tenantName: tenant?.name || 'Your business',
      createdBy: actor?.fullName || actor?.email || 'A team member',
      address: normalizeOptionalString(data.address),
    };
    await Promise.all(
      recipients.map((email) => this.emailService.sendStoreCreated(email, payload).catch(() => {})),
    );

    if (actor?.email) {
      const owner = await this.userModel
        .findOne({
          tenantId: new Types.ObjectId(tenantId),
          email: actor.email,
        })
        .lean();
      if (owner) {
        await this.auditService.log({
          tenantId,
          storeId: store._id.toString(),
          userId: owner._id.toString(),
          userName: actor.fullName || actor.email,
          action: 'store.create',
          entity: 'store',
          entityId: store._id.toString(),
          summary: `Created store "${nameStr}" (${code})`,
        });
      }
    }

    return store;
  }

  async updateStore(tenantId: string, storeId: string, data: UpdateStoreDto) {
    if (!isValidObjectId(tenantId) || !isValidObjectId(storeId)) {
      throw new NotFoundException('Store not found');
    }

    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!store) throw new NotFoundException('Store not found');

    if (data.name !== undefined) {
      const name = normalizeOptionalString(data.name);
      if (!name) throw new BadRequestException('Store name is required');
      store.name = name;
    }
    if (data.address !== undefined) store.address = normalizeOptionalString(data.address);
    if (data.phone !== undefined) (store as any).phone = normalizeOptionalString(data.phone);
    if (data.currency !== undefined) (store as any).currency = normalizeCurrencyCode(data.currency);
    if (data.defaultWarehouse !== undefined) {
      (store as any).defaultWarehouse = normalizeDefaultWarehouse(data.defaultWarehouse);
    }

    await store.save();
    return store;
  }

  async deleteStore(tenantId: string, storeId: string) {
    if (!isValidObjectId(tenantId) || !isValidObjectId(storeId)) {
      throw new NotFoundException('Store not found');
    }

    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!store) throw new NotFoundException('Store not found');
    await this.storeModel.findByIdAndDelete(storeId);
    return { message: 'Store deleted' };
  }

  async getProfile(userId: string, tenantId: string) {
    if (!isValidObjectId(userId)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.userModel.findById(userId).select('-passwordHash');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const stores = await this.getStores(tenantId);

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId ? user.tenantId.toString() : null,
      },
      stores,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (!isValidObjectId(userId)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, { fullName: dto.fullName }, { new: true })
      .select('-passwordHash');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId ? user.tenantId.toString() : null,
    };
  }

  /** Tenant-level business profile (Settings → Business). */
  async getBusinessProfile(tenantId: string) {
    if (!isValidObjectId(tenantId)) {
      throw new NotFoundException('Business not found');
    }

    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) {
      throw new NotFoundException('Business not found');
    }

    const settings = tenant.settings || {};

    return {
      name: tenant.name || '',
      systemName: settings.systemName || '',
      email: settings.email || '',
      phone: settings.phone || '',
      address: settings.address || '',
      city: settings.city || '',
      country: settings.country || '',
      logo: settings.logo || '',
      defaultLocale: normalizeLocale(settings.defaultLocale),
    };
  }

  /** Tenant-wide default UI language (Settings → Language). */
  async getLocale(tenantId: string) {
    if (!isValidObjectId(tenantId)) {
      throw new NotFoundException('Business not found');
    }
    const tenant = await this.tenantModel.findById(tenantId).lean();
    if (!tenant) {
      throw new NotFoundException('Business not found');
    }
    return { locale: normalizeLocale(tenant.settings?.defaultLocale) };
  }

  async updateLocale(tenantId: string, locale: string) {
    if (!isValidObjectId(tenantId)) {
      throw new NotFoundException('Business not found');
    }
    if (!(ALLOWED_LOCALES as readonly string[]).includes(locale)) {
      throw new BadRequestException(`Invalid locale. Allowed: ${ALLOWED_LOCALES.join(', ')}`);
    }
    const existing = await this.tenantModel.findById(tenantId).lean();
    if (!existing) {
      throw new NotFoundException('Business not found');
    }
    const settings = { ...(existing.settings || {}), defaultLocale: locale };
    await this.tenantModel.findByIdAndUpdate(tenantId, { $set: { settings } });
    return { locale };
  }

  async updateBusinessProfile(tenantId: string, dto: UpdateBusinessDto) {
    if (!isValidObjectId(tenantId)) {
      throw new NotFoundException('Business not found');
    }

    const logo = dto.logo;
    if (typeof logo === 'string' && logo.length > 2_800_000) {
      throw new BadRequestException('Logo file is too large. Maximum size is 2MB.');
    }

    const existing = await this.tenantModel.findById(tenantId).lean();
    if (!existing) {
      throw new NotFoundException('Business not found');
    }

    const settings = { ...(existing.settings || {}) };

    if (dto.systemName !== undefined) settings.systemName = String(dto.systemName || '');
    if (dto.email !== undefined) settings.email = String(dto.email || '');
    if (dto.phone !== undefined) settings.phone = String(dto.phone || '');
    if (dto.address !== undefined) settings.address = String(dto.address || '');
    if (dto.city !== undefined) settings.city = String(dto.city || '');
    if (dto.country !== undefined) settings.country = String(dto.country || '');
    if (dto.logo !== undefined) settings.logo = String(dto.logo || '');

    const update: Record<string, unknown> = { settings };
    if (dto.name !== undefined && String(dto.name).trim()) {
      update.name = String(dto.name).trim();
    }

    // Partial update — only touch business fields; avoids re-validating unrelated tenant fields.
    await this.tenantModel.findByIdAndUpdate(tenantId, { $set: update });

    return this.getBusinessProfile(tenantId);
  }
}
