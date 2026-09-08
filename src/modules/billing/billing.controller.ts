import { Controller, Get, Post, Patch, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/guards/permissions.guard';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { BillingService } from './billing.service';
import { ChangePlanDto, CreateCheckoutSessionDto, ToggleAutoRenewDto } from './dto/change-plan.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@SkipSubscription()
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('subscription')
  @RequirePermissions('billing.view')
  @ApiOperation({ summary: 'Get current subscription for tenant' })
  async getSubscription(@Req() req: Request) {
    const user = req.user as any;
    return this.billingService.getSubscription(user.tenantId);
  }

  @Get('plans')
  @RequirePermissions('billing.view')
  @ApiOperation({ summary: 'Get available plans' })
  async getPlans() {
    return this.billingService.getPlans();
  }

  @Post('change-plan')
  @RequirePermissions('billing.manage')
  @ApiOperation({ summary: 'Change subscription plan' })
  async changePlan(@Req() req: Request, @Body() body: ChangePlanDto) {
    const user = req.user as any;
    return this.billingService.changePlan(user.tenantId, body.planId, {
      userId: user.sub,
      userName: user.fullName || user.email,
      ip: req.ip,
    });
  }

  @Post('create-checkout-session')
  @RequirePermissions('billing.manage')
  @ApiOperation({ summary: 'Create Stripe Checkout session for plan upgrade' })
  async createCheckoutSession(@Req() req: Request, @Body() body: CreateCheckoutSessionDto) {
    const user = req.user as any;
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billingService.createCheckoutSession(user.tenantId, body.planId, {
      successUrl: body.successUrl || `${frontend}/billing?checkout=success`,
      cancelUrl: body.cancelUrl || `${frontend}/billing?checkout=cancelled`,
      customerEmail: user.email,
    });
  }

  @Patch('auto-renew')
  @RequirePermissions('billing.manage')
  @ApiOperation({ summary: 'Toggle auto-renewal' })
  async toggleAutoRenew(@Req() req: Request, @Body() body: ToggleAutoRenewDto) {
    const user = req.user as any;
    return this.billingService.toggleAutoRenew(user.tenantId, body.enabled);
  }

  @Post('create-portal-session')
  @RequirePermissions('billing.manage')
  @ApiOperation({ summary: 'Create Stripe Customer Billing Portal session' })
  async createPortalSession(@Req() req: Request) {
    const user = req.user as any;
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billingService.createBillingPortalSession(user.tenantId, {
      returnUrl: `${frontend}/billing`,
    });
  }

  @Get('history')
  @RequirePermissions('billing.view')
  @ApiOperation({ summary: 'Get billing history' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getBillingHistory(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as any;
    return this.billingService.getBillingHistory(
      user.tenantId,
      Number(page) || 1,
      Number(limit) || 10,
    );
  }

  @Get('usage')
  @RequirePermissions('billing.view')
  @ApiOperation({ summary: 'Get usage metrics vs plan limits' })
  async getUsageMetrics(@Req() req: Request) {
    const user = req.user as any;
    return this.billingService.getUsageMetrics(user.tenantId);
  }
}
