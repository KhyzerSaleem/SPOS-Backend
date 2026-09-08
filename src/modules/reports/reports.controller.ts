import { Controller, Get, Post, Query, Body, Req, UseGuards, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('reports')
@RequirePermissions('reports.view')
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  private ctx(req: Request) {
    const user = req.user as any;
    return { tenantId: user.tenantId, storeId: (req as any).store.id };
  }

  @Get(':report/export')
  @RequirePermissions('reports.export')
  @ApiOperation({ summary: 'Export a report as CSV, JSON, Excel, PDF, or DOCX' })
  async exportReport(
    @Req() req: Request,
    @Param('report') report: string,
    @Query() q: any,
    @Res() res: Response,
  ) {
    const { tenantId, storeId } = this.ctx(req);
    const exportFile = await this.reportsService.exportReport(tenantId, storeId, report, q);
    res.setHeader('Content-Type', exportFile.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportFile.fileName}"`);
    res.send(exportFile.buffer);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Sales report with aggregation' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async sales(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.salesReport(tenantId, storeId, q);
  }

  @Post('sales/email')
  @RequirePermissions('reports.export')
  @ApiOperation({ summary: 'Email sales report to user or specified address' })
  async emailSalesReport(
    @Req() req: Request,
    @Query() q: Record<string, string>,
    @Body() body: { email?: string },
  ) {
    const user = req.user as { email: string };
    const { tenantId, storeId } = this.ctx(req);
    const to = body?.email || user.email;
    return this.reportsService.emailSalesReport(to, tenantId, storeId, q);
  }

  @Get('daily-summary')
  @ApiOperation({ summary: 'Daily summary / closing report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async dailySummary(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.dailySummary(tenantId, storeId, q);
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Purchase report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async purchases(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.purchaseReport(tenantId, storeId, q);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'Expense report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async expenses(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.expenseReport(tenantId, storeId, q);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Inventory report – current stock levels' })
  async inventory(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.inventoryReport(tenantId, storeId);
  }

  @Get('inventory-valuation')
  @ApiOperation({ summary: 'Inventory valuation at cost and retail' })
  async inventoryValuation(@Req() req: Request) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.inventoryValuation(tenantId, storeId);
  }

  @Get('dead-stock')
  @ApiOperation({ summary: 'Dead stock report' })
  @ApiQuery({ name: 'days', required: false, description: 'Days threshold (default 90)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async deadStock(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.deadStockReport(tenantId, storeId, q);
  }

  @Get('stock-movement')
  @ApiOperation({ summary: 'Stock movement report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async stockMovement(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.stockMovement(tenantId, storeId, q);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Customer report with spending analysis' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async customers(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.customerReport(tenantId, storeId, q);
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'Supplier report with payment analysis' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async suppliers(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.supplierReport(tenantId, storeId, q);
  }

  @Get('vat-tax')
  @ApiOperation({ summary: 'VAT / Tax report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async vatTax(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.vatTaxReport(tenantId, storeId, q);
  }

  @Get('profit-loss')
  @ApiOperation({ summary: 'Profit & Loss statement' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async profitLoss(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.profitLoss(tenantId, storeId, q);
  }

  @Get('transfers')
  @ApiOperation({ summary: 'Transfer report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async transfers(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.transferReport(tenantId, storeId, q);
  }

  @Get('staff-performance')
  @ApiOperation({ summary: 'Staff performance report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async staffPerformance(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.staffPerformance(tenantId, storeId, q);
  }

  @Get('variants/sell-through')
  @ApiOperation({ summary: 'Variant sell-through by product' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async variantSellThrough(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.variantSellThrough(tenantId, storeId, q);
  }

  @Get('variants/attribute-breakdown')
  @ApiOperation({ summary: 'Variant attribute breakdown from sales' })
  @ApiQuery({ name: 'productId', required: true })
  @ApiQuery({
    name: 'attributeName',
    required: false,
    description: 'Attribute to break down (Size, Weight, etc.)',
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async variantAttributeBreakdown(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.variantAttributeBreakdown(tenantId, storeId, q.productId, q);
  }

  /** @deprecated — use /reports/variants/sell-through */
  @Get('apparel/sell-through')
  @ApiOperation({ summary: 'Apparel sell-through (alias)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async apparelSellThrough(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.variantSellThrough(tenantId, storeId, q);
  }

  /** @deprecated — use /reports/variants/attribute-breakdown */
  @Get('apparel/size-curve')
  @ApiOperation({ summary: 'Apparel size curve (alias)' })
  @ApiQuery({ name: 'productId', required: true })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async apparelSizeCurve(@Req() req: Request, @Query() q: any) {
    const { tenantId, storeId } = this.ctx(req);
    return this.reportsService.variantAttributeBreakdown(tenantId, storeId, q.productId, q);
  }
}
