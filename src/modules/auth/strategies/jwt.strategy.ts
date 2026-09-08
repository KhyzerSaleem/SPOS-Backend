import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../../database/schemas/user.schema';
import { Subscription, SubscriptionDocument } from '../../../database/schemas/subscription.schema';
import { allowsBillingRecoveryAuth } from '../../../common/utils/billing-recovery.util';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  permissions: string[];
  effectivePermissions: string[];
  storeAccess: string[];
  featureAccess?: string[];
  plan?: string;
  tokenVersion?: number;
  impersonated?: boolean;
  impersonatedBy?: string;
  impersonatedByEmail?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set. Cannot start application.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      // Pin explicitly: this is a symmetric HMAC secret, so verification must
      // never accept an asymmetric (RS/ES*) or "none" algorithm token.
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userModel
      .findById(payload.sub)
      .select('isActive tokenVersion tenantId role')
      .lean();

    if (!user) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    if (!user.isActive) {
      const canRecover = await allowsBillingRecoveryAuth(this.subscriptionModel, user);
      if (!canRecover) {
        throw new UnauthorizedException('User account is inactive or not found');
      }
    }

    const currentVersion = user.tokenVersion ?? 0;
    const payloadVersion = payload.tokenVersion ?? 0;
    if (currentVersion !== payloadVersion) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      permissions: payload.permissions ?? [],
      effectivePermissions: payload.effectivePermissions ?? [],
      storeAccess: payload.storeAccess ?? [],
      featureAccess: payload.featureAccess ?? [],
      plan: payload.plan ?? 'basic',
      impersonated: payload.impersonated === true,
      impersonatedBy: payload.impersonatedBy ?? '',
      impersonatedByEmail: payload.impersonatedByEmail ?? '',
    };
  }
}
