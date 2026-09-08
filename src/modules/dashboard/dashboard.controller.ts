import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/guards/permissions.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('kpi')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get KPI summary for current store' })
  @ApiResponse({ status: 200, description: 'KPI data with period comparisons' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date ISO string' })
  @ApiQuery({ name: 'to', required: false, description: 'End date ISO string' })
  async getKpi(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getKpi(user.tenantId, store.id, from, to);
  }

  @Get('sales-purchase-chart')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get sales and purchase chart data' })
  @ApiQuery({ name: 'period', required: false, enum: ['1D', '1W', '1M', '3M', '6M', '1Y'] })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getSalesPurchaseChart(
    @Req() req: Request,
    @Query('period') period: string = '1Y',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getSalesPurchaseChart(user.tenantId, store.id, period, from, to);
  }

  @Get('overview-counts')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get supplier, customer, and order counts' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getOverviewCounts(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getOverviewCounts(user.tenantId, store.id, from, to);
  }

  @Get('customers-overview')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get first-time vs returning customers breakdown' })
  @ApiQuery({ name: 'period', required: false, enum: ['today', 'this_week', 'this_month'] })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getCustomersOverview(
    @Req() req: Request,
    @Query('period') period: string = 'today',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getCustomersOverview(user.tenantId, store.id, period, from, to);
  }

  @Get('top-selling-products')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get top selling products by quantity' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getTopSellingProducts(
    @Req() req: Request,
    @Query('limit') limit: string = '5',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getTopSellingProducts(
      user.tenantId,
      store.id,
      parseInt(limit, 10),
      from,
      to,
    );
  }

  @Get('low-stock-products')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get products below reorder point' })
  async getLowStockProducts(@Req() req: Request) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getLowStockProducts(user.tenantId, store.id);
  }

  @Get('recent-sales')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get recent sale orders' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getRecentSales(
    @Req() req: Request,
    @Query('limit') limit: string = '5',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getRecentSales(
      user.tenantId,
      store.id,
      parseInt(limit, 10),
      from,
      to,
    );
  }

  @Get('sales-statistics')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get revenue vs expense breakdown for a date range' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'year', required: false })
  async getSalesStatistics(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('year') year?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    const y = year ? parseInt(year, 10) : undefined;
    return this.dashboardService.getSalesStatistics(user.tenantId, store.id, from, to, y);
  }

  @Get('recent-transactions')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get recent transactions by type' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['sale', 'purchase', 'quotation', 'expenses', 'invoices'],
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getRecentTransactions(
    @Req() req: Request,
    @Query('type') type: string = 'sale',
    @Query('limit') limit: string = '10',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getRecentTransactions(
      user.tenantId,
      store.id,
      type,
      parseInt(limit, 10),
      from,
      to,
    );
  }

  @Get('top-customers')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get top customers by spend' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getTopCustomers(
    @Req() req: Request,
    @Query('limit') limit: string = '5',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getTopCustomers(
      user.tenantId,
      store.id,
      parseInt(limit, 10),
      from,
      to,
    );
  }

  @Get('top-categories')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get top product categories by sales' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getTopCategories(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getTopCategories(user.tenantId, store.id, from, to);
  }

  @Get('order-heatmap')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Get order activity heatmap data' })
  @ApiQuery({ name: 'period', required: false, enum: ['this_week', 'last_week', 'this_month'] })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getOrderHeatmap(
    @Req() req: Request,
    @Query('period') period: string = 'this_week',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.dashboardService.getOrderHeatmap(user.tenantId, store.id, period, from, to);
  }
}
