import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

import { User, UserSchema } from '../../database/schemas/user.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { RefreshToken, RefreshTokenSchema } from '../../database/schemas/refresh-token.schema';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Otp, OtpSchema } from '../../database/schemas/otp.schema';
import { Invite, InviteSchema } from '../../database/schemas/invite.schema';
import { Subscription, SubscriptionSchema } from '../../database/schemas/subscription.schema';
import { Plan, PlanSchema } from '../../database/schemas/plan.schema';
import { HrmModule } from '../hrm/hrm.module';

@Module({
  imports: [
    HrmModule,
    // Set 'jwt' as the default Passport strategy so @UseGuards(AuthGuard())
    // works without an explicit strategy name argument
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          // Fail at bootstrap — a missing secret means every token would be
          // signed with undefined, making the entire auth system insecure
          throw new Error('JWT_SECRET environment variable is not set.');
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>('JWT_EXPIRATION') ?? '4h',
            // Pin explicitly rather than relying on the library default — this
            // secret is a symmetric HMAC key only; nothing here should ever
            // sign or accept an asymmetric (RS/ES*) or "none" algorithm.
            algorithm: 'HS256',
          },
        };
      },
    }),

    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Otp.name, schema: OtpSchema },
      { name: Invite.name, schema: InviteSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, GoogleStrategy],
  exports: [
    AuthService,
    JwtModule, // allows other modules to inject JwtService without re-registering
    PassportModule, // allows other modules to use Passport decorators/guards
  ],
})
export class AuthModule {}
