import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Req,
  Query,
  Res,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { SettingsService } from './settings.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditService } from '../../common/services/audit.service';
import { isProOrEnterprise } from '../../common/constants/plan-features';
import { CurrencyService } from '../../common/services/currency.service';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private svc: SettingsService,
    private tenantService: TenantService,
    private auditService: AuditService,
    private currencyService: CurrencyService,
  ) {}

  private actor(req: Request) {
    const user = req.user as any;
    return {
      userId: user.sub,
      userName: user.fullName || user.email || 'User',
      ip: req.ip,
    };
  }

  private assertProPlan(req: Request) {
    const user = req.user as any;
    if (!isProOrEnterprise(user.plan)) {
      throw new ForbiddenException('This feature requires Pro or Enterprise plan.');
    }
  }

  private ctx(req: Request) {
    const user = req.user as any;
    return { tenantId: user.tenantId, storeId: (req as any).store?.id || '' };
  }

  // ── Locale (tenant-wide default language) ──
  @Get('locale')
  @ApiOperation({ summary: 'Get tenant default locale' })
  async getLocale(@Req() req: Request) {
    const user = req.user as any;
    return this.tenantService.getLocale(user.tenantId);
  }

  @Put('locale')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update tenant default locale' })
  async putLocale(@Req() req: Request, @Body() body: { locale?: string }) {
    const user = req.user as any;
    return this.tenantService.updateLocale(user.tenantId, body?.locale || 'en');
  }

  // ── Currency ──
  @Get('currency')
  @ApiOperation({ summary: 'Get currency settings' })
  async getCurrency(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    const [setting, baseCurrency, storeCurrency] = await Promise.all([
      this.svc.getSetting(tenantId, storeId, 'currency'),
      this.currencyService.resolveTenantBaseCurrency(tenantId),
      storeId
        ? this.currencyService.resolveStoreCurrency(tenantId, storeId)
        : this.currencyService.resolveTenantBaseCurrency(tenantId),
    ]);
    return {
      ...(setting || {
        code: storeCurrency,
        symbol: '$',
        decimalPlaces: 2,
        thousandSeparator: ',',
        decimalSeparator: '.',
        position: 'before',
      }),
      code: storeCurrency,
      storeCurrency,
      baseCurrency,
      isBaseCurrency: storeCurrency === baseCurrency,
    };
  }

  @Put('currency')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update currency settings' })
  async putCurrency(@Req() req: Request, @Body() body: any) {
    const { tenantId, storeId } = this.ctx(req);
    await this.svc.putSetting(tenantId, storeId, 'currency', body);
    return body;
  }

  @Get('exchange-rates')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List manual exchange rates for tenant base-currency conversion' })
  async getExchangeRates(@Req() req: Request) {
    const { tenantId } = this.ctx(req);
    return this.svc.getExchangeRates(tenantId);
  }

  @Post('exchange-rates')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create or update a manual exchange rate' })
  async upsertExchangeRate(@Req() req: Request, @Body() body: any) {
    const { tenantId } = this.ctx(req);
    return this.svc.upsertExchangeRate(tenantId, body);
  }

  @Delete('exchange-rates/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete a manual exchange rate' })
  async deleteExchangeRate(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.deleteExchangeRate(tenantId, id);
  }

  // ── Taxes ──
  @Get('taxes')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List taxes' })
  async getTaxes(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.getTaxes(tenantId, storeId);
  }

  @Post('taxes')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create a tax' })
  async createTax(@Req() req: Request, @Body() body: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.createTax(tenantId, storeId, body);
  }

  @Delete('taxes/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete a tax' })
  async deleteTax(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.deleteTax(tenantId, id);
  }

  // ── Discounts ──
  @Get('discounts')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List discount rules' })
  async getDiscounts(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.getDiscounts(tenantId, storeId);
  }

  @Post('discounts')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create a discount rule' })
  async createDiscount(@Req() req: Request, @Body() body: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.createDiscount(tenantId, storeId, body);
  }

  @Delete('discounts/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete a discount rule' })
  async deleteDiscount(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.deleteDiscount(tenantId, id);
  }

  // ── Pricing Rules ──
  @Get('pricing-rules')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List pricing rules' })
  async getPricingRules(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.getPricingRules(tenantId, storeId);
  }

  @Post('pricing-rules')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create a pricing rule' })
  async createPricingRule(@Req() req: Request, @Body() body: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.createPricingRule(tenantId, storeId, body);
  }

  @Delete('pricing-rules/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete a pricing rule' })
  async deletePricingRule(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.deletePricingRule(tenantId, id);
  }

  // ── Payment Methods ──
  @Get('payment-methods')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List payment methods' })
  async getPaymentMethods(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.getPaymentMethods(tenantId, storeId);
  }

  @Post('payment-methods')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create/update a payment method' })
  async createPaymentMethod(@Req() req: Request, @Body() body: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.createPaymentMethod(tenantId, storeId, body);
  }

  @Delete('payment-methods/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete a payment method' })
  async deletePaymentMethod(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.deletePaymentMethod(tenantId, id);
  }

  // ── API Keys (Enterprise) ──
  @Get('api-keys')
  @RequireFeature('api')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List API keys' })
  async getApiKeys(@Req() req: Request) {
    const { tenantId } = this.ctx(req);
    return this.svc.getApiKeys(tenantId);
  }

  @Post('api-keys')
  @RequireFeature('api')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Generate a new API key' })
  async generateApiKey(@Req() req: Request, @Body() body: any) {
    const { tenantId } = this.ctx(req);
    return this.svc.generateApiKey(tenantId, body, this.actor(req));
  }

  @Delete('api-keys/:id')
  @RequireFeature('api')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revokeApiKey(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.revokeApiKey(tenantId, id, this.actor(req));
  }

  // ── Roles ──
  @Get('roles')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List all roles for tenant' })
  async getRoles(@Req() req: Request) {
    const { tenantId } = this.ctx(req);
    return this.svc.getRoles(tenantId);
  }

  @Post('roles')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create a role' })
  async createRole(@Req() req: Request, @Body() body: any) {
    const { tenantId } = this.ctx(req);
    return this.svc.createRole(tenantId, body, this.actor(req));
  }

  @Put('roles/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update a role' })
  async updateRole(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const { tenantId } = this.ctx(req);
    return this.svc.updateRole(tenantId, id, body, this.actor(req));
  }

  @Delete('roles/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete a role' })
  async deleteRole(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.deleteRole(tenantId, id, this.actor(req));
  }

  // ── Email/SMS ──
  @Get('email')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'Get email/SMS gateway config' })
  async getEmailConfig(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.getEmailConfig(tenantId, storeId);
  }

  @Put('email')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update email/SMS gateway config' })
  async updateEmailConfig(@Req() req: Request, @Body() body: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.updateEmailConfig(tenantId, storeId, body);
  }

  // ── Receipt Template ──
  @Get('receipt-template')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'Get receipt template' })
  async getReceiptTemplate(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.getSetting(tenantId, storeId, 'receipt_template');
  }

  @Put('receipt-template')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update receipt template' })
  async putReceiptTemplate(@Req() req: Request, @Body() body: any) {
    const { tenantId, storeId } = this.ctx(req);
    await this.svc.putSetting(tenantId, storeId, 'receipt_template', body);
    return body;
  }

  // ── Invoice Format ──
  @Get('invoice-format')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'Get invoice numbering format' })
  async getInvoiceFormat(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.getInvoiceFormat(tenantId, storeId);
  }

  @Put('invoice-format')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update invoice numbering format' })
  async updateInvoiceFormat(@Req() req: Request, @Body() body: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.svc.updateInvoiceFormat(tenantId, storeId, body);
  }

  // ── Audit Log (Pro+) ──
  @Get('audit-log')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'Paginated tenant audit log (Pro+)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'entity', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async getAuditLog(@Req() req: Request, @Query() q: Record<string, string>) {
    this.assertProPlan(req);
    const user = req.user as any;
    return this.auditService.list(user.tenantId, {
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
      entity: q.entity,
      action: q.action,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  @Get('audit-log/export')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'Export audit log as CSV (Pro+)' })
  async exportAuditLog(
    @Req() req: Request,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    this.assertProPlan(req);
    const user = req.user as any;
    const csv = await this.auditService.exportCsv(user.tenantId, q);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(csv);
  }

  // ── Webhooks (Enterprise + API) ──
  @Get('webhooks')
  @RequireFeature('api')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'List webhook subscriptions' })
  async getWebhooks(@Req() req: Request) {
    const { tenantId } = this.ctx(req);
    return this.svc.getWebhooks(tenantId);
  }

  @Post('webhooks')
  @RequireFeature('api')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create webhook subscription' })
  async createWebhook(@Req() req: Request, @Body() body: any) {
    const { tenantId } = this.ctx(req);
    return this.svc.createWebhook(tenantId, body);
  }

  @Put('webhooks/:id')
  @RequireFeature('api')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update webhook subscription' })
  async updateWebhook(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const { tenantId } = this.ctx(req);
    return this.svc.updateWebhook(tenantId, id, body);
  }

  @Delete('webhooks/:id')
  @RequireFeature('api')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Delete webhook subscription' })
  async deleteWebhook(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.deleteWebhook(tenantId, id);
  }

  @Post('webhooks/:id/rotate-secret')
  @RequireFeature('api')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Rotate webhook signing secret' })
  async rotateWebhookSecret(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.ctx(req);
    return this.svc.rotateWebhookSecret(tenantId, id);
  }
}
