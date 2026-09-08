import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { ArApService } from './ar-ap.service';

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('finance')
@Controller('finance')
export class ArApController {
  constructor(private arApService: ArApService) {}

  @Get('ar/aging')
  @RequirePermissions('finance.view')
  @ApiOperation({
    summary: 'Accounts receivable aging (consolidated across stores, base currency)',
  })
  async getReceivablesAging(@Req() req: Request) {
    const user = req.user as any;
    return this.arApService.getReceivablesAging(user.tenantId);
  }

  @Get('ar/customers/:id/statement')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Customer statement of account with running balance' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getCustomerStatement(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    return this.arApService.getCustomerStatement(user.tenantId, id, from, to);
  }

  @Get('ap/aging')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Accounts payable aging (consolidated across stores, base currency)' })
  async getPayablesAging(@Req() req: Request) {
    const user = req.user as any;
    return this.arApService.getPayablesAging(user.tenantId);
  }

  @Get('ap/suppliers/:id/statement')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Supplier statement of account with running balance' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getSupplierStatement(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    return this.arApService.getSupplierStatement(user.tenantId, id, from, to);
  }

  // ─── Frontend-shape wrappers ────────────────────────────────────────────
  // Mirrors FinanceController's /finance/reports/:tab convention so the
  // reports page's single fetch(`/api/finance/reports/${activeTab}`) pattern
  // covers these two tabs without a special case.

  @Get('reports/ar-aging')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Accounts receivable aging (reports-tab shape)' })
  async getReceivablesAgingReport(@Req() req: Request) {
    return this.getReceivablesAging(req);
  }

  @Get('reports/ap-aging')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Accounts payable aging (reports-tab shape)' })
  async getPayablesAgingReport(@Req() req: Request) {
    return this.getPayablesAging(req);
  }
}
