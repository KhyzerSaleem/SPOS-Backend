import { Controller, Get, Post, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiProduces } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { SalesService } from './sales.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ProcessReturnDto } from './dto/process-return.dto';
import { CreateBackOfficeSaleDto } from './dto/create-sale.dto';

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('sales')
@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  // ── List sales ──

  @Get()
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'List sales (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['sale', 'return'] })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentStatus', required: false, enum: ['paid', 'partial', 'unpaid'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.salesService.findAll(user.tenantId, store.id, query);
  }

  // ── Returns list ──

  @Get('returns')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'List return orders' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findReturns(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.salesService.findReturns(user.tenantId, store.id, query);
  }

  // ── Export CSV ──

  @Get('export')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Export sales to CSV' })
  @ApiProduces('text/csv')
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async exportCsv(@Req() req: Request, @Res() res: Response, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    const csv = await this.salesService.exportCsv(user.tenantId, store.id, query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales-export-${Date.now()}.csv`);
    res.send(csv);
  }

  // ── Sale detail ──

  @Get(':id')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get sale detail' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.salesService.findOne(user.tenantId, store.id, id);
  }

  // ── Create back-office sale ──

  @Post()
  @RequirePermissions('sales.manage')
  @ApiOperation({ summary: 'Create a sale from back office' })
  async createSale(@Req() req: Request, @Body() dto: CreateBackOfficeSaleDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.salesService.createSale(user.tenantId, store.id, user.sub, dto);
  }

  // ── Record payment ──

  @Post(':id/payments')
  @RequirePermissions('sales.manage')
  @ApiOperation({ summary: 'Record a payment against a sale' })
  async recordPayment(@Req() req: Request, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.salesService.recordPayment(user.tenantId, store.id, id, dto);
  }

  // ── Process return ──

  @Post(':id/return')
  @RequirePermissions('returns.process')
  @ApiOperation({ summary: 'Process a return against a sale (reverses stock)' })
  async processReturn(@Req() req: Request, @Param('id') id: string, @Body() dto: ProcessReturnDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.salesService.processReturn(user.tenantId, store.id, user.sub, id, dto, {
      userName: user.fullName || user.email,
      ip: req.ip,
    });
  }

  // ── Invoice HTML ──

  @Get(':id/invoice')
  @RequirePermissions('sales.view')
  @ApiOperation({ summary: 'Get invoice as HTML' })
  @ApiProduces('text/html')
  async getInvoice(@Req() req: Request, @Res() res: Response, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    const html = await this.salesService.getInvoiceHtml(user.tenantId, store.id, id);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  // ── Email invoice (stub – will integrate with email service later) ──

  @Post(':id/email-invoice')
  @RequirePermissions('sales.manage')
  @ApiOperation({ summary: 'Email invoice to customer' })
  async emailInvoice(@Req() _req: Request, @Param('id') _id: string) {
    return { message: 'Invoice email queued (email service pending configuration)' };
  }
}
