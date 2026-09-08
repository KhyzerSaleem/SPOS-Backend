import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { JwtAuthGuard, Public } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/guards/permissions.guard';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';

import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { InviteDto, AcceptInviteDto, ChangePasswordDto } from './dto/invite.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';

@ApiTags('Auth')
@UseGuards(ThrottlerGuard, JwtAuthGuard) // JwtAuthGuard applied globally here;
@Controller('auth') // @Public() opts individual routes out
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Registration & OTP
  // ---------------------------------------------------------------------------

  @Public()
  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new tenant owner account — sends OTP email' })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('verify-otp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and receive tokens' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyOtpAndLogin(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return {
      user: result.user,
      stores: result.stores,
      featureAccess: result.featureAccess,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @Post('resend-otp')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to email' })
  resendOtp(@Body() body: ResendOtpDto) {
    return this.authService.resendOtp(body.email);
  }

  // ---------------------------------------------------------------------------
  // Password management
  // ---------------------------------------------------------------------------

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password-reset OTP to email' })
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using OTP' })
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.email, body.otp, body.newPassword);
  }

  @Public()
  @Post('unlock-account')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Emergency account unlock (requires ADMIN_SECRET)' })
  unlockAccount(@Body() body: { email: string; adminSecret: string }) {
    return this.authService.unlockAccount(body.email, body.adminSecret);
  }

  @Post('change-password')
  @SkipSubscription()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated)' })
  changePassword(@Req() req: Request, @Body() body: ChangePasswordDto) {
    const user = req.user as any;
    return this.authService.changePassword(user.sub, body);
  }

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(req.user as any);
    // LocalAuthGuard validates email/password off the body; rememberMe rides
    // along on the same payload and only affects cookie persistence.
    const rememberMe = (req.body as { rememberMe?: unknown })?.rememberMe === true;
    this.setRefreshCookie(res, result.refreshToken, rememberMe);
    return {
      user: result.user,
      stores: result.stores,
      featureAccess: result.featureAccess,
      accessToken: result.accessToken,
    };
  }

  // ---------------------------------------------------------------------------
  // Google OAuth
  // ---------------------------------------------------------------------------

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen' })
  googleAuth() {
    // Passport handles the redirect — no body needed
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.handleGoogleAuth(req.user as any);
    this.setRefreshCookie(res, result.refreshToken);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    // Only pass the access token in the URL — user data is fetched by the
    // frontend via GET /api/auth/me immediately after the redirect
    const params = new URLSearchParams({ token: result.accessToken });
    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------

  @Get('me')
  @SkipSubscription()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile with permissions and feature access' })
  getMe(@Req() req: Request) {
    const user = req.user as any;
    return this.authService.getProfile(user.sub);
  }

  @Patch('profile')
  @SkipSubscription()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update profile (name, picture)' })
  updateProfile(@Req() req: Request, @Body() body: { fullName?: string; picture?: string }) {
    const user = req.user as any;
    return this.authService.updateProfile(user.sub, body);
  }

  // ---------------------------------------------------------------------------
  // Invite system
  // ---------------------------------------------------------------------------

  @Post('invite')
  @ApiBearerAuth()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Invite a team member (requires settings.manage permission)' })
  invite(@Req() req: Request, @Body() body: InviteDto) {
    const user = req.user as any;
    return this.authService.inviteTeamMember(user.tenantId, user.email, body);
  }

  @Get('invites')
  @ApiBearerAuth()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List all pending invites for the tenant' })
  getInvites(@Req() req: Request) {
    const user = req.user as any;
    return this.authService.getInvites(user.tenantId);
  }

  @Public()
  @Post('invite/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept invite and activate account' })
  async acceptInvite(@Body() body: AcceptInviteDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.acceptInvite(body.token);
    this.setRefreshCookie(res, result.refreshToken);
    return {
      user: result.user,
      stores: result.stores,
      featureAccess: result.featureAccess,
      accessToken: result.accessToken,
    };
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  @Public()
  @SkipSubscription()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using httpOnly cookie' })
  refresh(@Req() req: Request) {
    const refreshToken = req.cookies?.refreshToken;
    return this.authService.refresh(refreshToken);
  }

  @Public()
  @SkipSubscription()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear refresh token cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    await this.authService.logout(refreshToken);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      path: '/api/auth/refresh',
      ...(this.isProduction() && { secure: true }),
    });
    return { message: 'Logged out successfully' };
  }

  // ---------------------------------------------------------------------------
  // Super-admin bootstrap (separate admin controller is preferred long-term)
  // ---------------------------------------------------------------------------

  @Public()
  @Post('admin/signup')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Bootstrap a super-admin account (requires ADMIN_SECRET)' })
  adminSignup(
    @Body() body: { name: string; email: string; password: string; adminSecret: string },
  ) {
    return this.authService.adminSignup(body);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  /**
   * @param remember "Keep me signed in". Controls cookie persistence only:
   *   true  -> Max-Age 30 days, survives a browser restart.
   *   false -> no Max-Age, i.e. a session cookie that dies with the browser.
   * Omitting it keeps the previous 7-day default for flows that don't ask
   * (Google OAuth, invite accept, OTP verify).
   */
  private setRefreshCookie(res: Response, token: string, remember?: boolean): void {
    const domain = this.configService.get<string>('COOKIE_DOMAIN');
    const maxAge =
      remember === undefined
        ? 7 * 24 * 60 * 60 * 1000
        : remember
          ? 30 * 24 * 60 * 60 * 1000
          : undefined;
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: this.isProduction(), // HTTPS only in production
      sameSite: 'lax', // 'lax' required for Google OAuth cross-site redirect
      path: '/api/auth/refresh',
      ...(maxAge !== undefined && { maxAge }),
      ...(domain && { domain }), // only set domain if explicitly configured
    });
  }
}
