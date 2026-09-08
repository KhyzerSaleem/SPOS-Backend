import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import {
  RecordSupplierInvoiceDto,
  RecordSupplierPaymentDto,
} from './dto/record-supplier-invoice.dto';
import { CreatePurchaseReturnDto } from './dto/purchase-return.dto';

@ApiTags('Purchases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('purchases')
@Controller('purchases')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  @Get()
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'List purchase orders' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.findAll(user.tenantId, store.id, query);
  }

  @Get('returns')
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'List purchase returns' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findReturns(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.findReturns(user.tenantId, store.id, query);
  }

  @Get('supplier-invoices')
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'List supplier invoices' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'paymentStatus', required: false })
  @ApiQuery({ name: 'status', required: false })
  async findSupplierInvoices(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.findSupplierInvoices(user.tenantId, store.id, query);
  }

  @Get(':id')
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'Get purchase order detail' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.findOne(user.tenantId, store.id, id);
  }

  @Post()
  @RequirePermissions('purchases.create')
  @ApiOperation({ summary: 'Create purchase order' })
  async create(@Req() req: Request, @Body() dto: CreatePurchaseOrderDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.create(user.tenantId, store.id, user.sub, dto);
  }

  @Put(':id')
  @RequirePermissions('purchases.create')
  @ApiOperation({ summary: 'Update purchase order' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: CreatePurchaseOrderDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.update(user.tenantId, store.id, id, dto);
  }

  @Put(':id/status')
  @RequirePermissions('purchases.approve')
  @ApiOperation({ summary: 'Update PO status (approve, cancel, etc.)' })
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.updateStatus(user.tenantId, store.id, user.sub, id, body.status);
  }

  @Post(':id/receive')
  @RequirePermissions('purchases.receive')
  @ApiOperation({ summary: 'Receive goods against PO (creates GRN, updates stock)' })
  async receiveGoods(@Req() req: Request, @Param('id') id: string, @Body() dto: ReceiveGoodsDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.receiveGoods(user.tenantId, store.id, user.sub, id, dto);
  }

  @Get(':id/grns')
  @RequirePermissions('purchases.view')
  @ApiOperation({ summary: 'List GRNs for a purchase order' })
  async getGRNs(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.getGRNs(user.tenantId, store.id, id);
  }

  @Post(':id/invoice')
  @RequirePermissions('purchases.invoice')
  @ApiOperation({ summary: 'Record supplier invoice against PO' })
  async recordInvoice(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: RecordSupplierInvoiceDto,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.recordInvoice(user.tenantId, store.id, user.sub, id, dto);
  }

  @Post('invoices/:invoiceId/verify')
  @RequirePermissions('purchases.invoice')
  @ApiOperation({ summary: 'Verify supplier invoice and post accounts payable' })
  async verifyInvoice(@Req() req: Request, @Param('invoiceId') invoiceId: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.verifyInvoice(user.tenantId, store.id, user.sub, invoiceId);
  }

  @Post('invoices/:invoiceId/payments')
  @RequirePermissions('purchases.invoice')
  @ApiOperation({ summary: 'Record supplier invoice payment' })
  async recordInvoicePayment(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: RecordSupplierPaymentDto,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.recordInvoicePayment(
      user.tenantId,
      store.id,
      user.sub,
      invoiceId,
      dto,
    );
  }

  @Post(':id/return')
  @RequirePermissions('purchases.return')
  @ApiOperation({ summary: 'Process return against received PO (reverses stock)' })
  async processReturn(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreatePurchaseReturnDto,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.purchasesService.processReturn(user.tenantId, store.id, user.sub, id, dto);
  }
}
