import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyDocument } from '../../database/schemas/settings.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { resolveTenantFeatures } from '../../common/constants/plan-features';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const rawKey = (req.headers['x-api-key'] as string) || '';
    if (!rawKey) {
      throw new UnauthorizedException('X-API-Key header is required');
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.apiKeyModel.findOne({ keyHash, isActive: true }).lean();
    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    const tenant = await this.tenantModel.findById(apiKey.tenantId).lean();
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Tenant not found or inactive');
    }

    const features = resolveTenantFeatures(tenant.plan, tenant.featureAccess || []);
    if (!features.includes('api')) {
      throw new UnauthorizedException('API access requires Enterprise plan');
    }

    await this.apiKeyModel.updateOne({ _id: apiKey._id }, { $set: { lastUsed: new Date() } });

    req.user = {
      tenantId: tenant._id.toString(),
      plan: tenant.plan,
      featureAccess: features,
      apiKeyId: apiKey._id.toString(),
      apiKeyScopes: apiKey.scopes || ['read'],
      role: 'api',
    };

    return true;
  }
}
