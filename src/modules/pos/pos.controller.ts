import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { PosService } from './pos.service';
import { PosShiftService } from './pos-shift.service';
import { HoldOrderDto } from './dto/hold-order.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdatePosSettingsDto } from './dto/update-settings.dto';
import { OpenShiftDto, CloseShiftDto } from './dto/shift.dto';
import { CreateExchangeDto, LoyaltyRedeemPreviewDto } from './dto/exchange.dto';

@ApiTags('POS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('pos')
@Controller('pos')
export class PosController {
  constructor(
    private posService: PosService,
    private shiftService: PosShiftService,
  ) {}

  @Get('products/barcode')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Lookup product by exact barcode or SKU for POS scanning' })
  @ApiQuery({ name: 'code', required: true })
  async lookupBarcode(@Req() req: Request, @Query('code') code: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.findProductByBarcode(user.tenantId, store.id, code);
  }

  @Get('products/search')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Search products by name/SKU/barcode' })
  @ApiQuery({ name: 'q', required: true })
  async searchProducts(@Req() req: Request, @Query('q') query: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.searchProducts(user.tenantId, store.id, query);
  }

  @Post('hold')
  @RequirePermissions('pos.hold')
  @ApiOperation({ summary: 'Hold current cart' })
  async holdOrder(@Req() req: Request, @Body() dto: HoldOrderDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.holdOrder(user.tenantId, store.id, user.sub, dto);
  }

  @Get('held-orders')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'List held orders for current cashier' })
  async getHeldOrders(@Req() req: Request) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.getHeldOrders(user.tenantId, store.id, user.sub);
  }

  @Delete('held-orders/:id')
  @RequirePermissions('pos.hold')
  @ApiOperation({ summary: 'Delete a held order' })
  async deleteHeldOrder(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.deleteHeldOrder(user.tenantId, store.id, user.sub, id);
  }

  @Post('sales')
  @RequirePermissions('pos.create')
  @ApiOperation({ summary: 'Create a sale with atomic stock update' })
  async createSale(@Req() req: Request, @Body() dto: CreateSaleDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.createSale(user.tenantId, store.id, user.sub, dto, user.plan);
  }

  @Post('promotions/evaluate')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Evaluate applicable discount and pricing rules for cart' })
  async evaluatePromotions(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.evaluatePromotions(user.tenantId, store.id, body as any);
  }

  @Get('sales/lookup')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Lookup sale by order number for returns' })
  @ApiQuery({ name: 'orderNumber', required: true })
  async lookupSale(@Req() req: Request, @Query('orderNumber') orderNumber: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.lookupSaleForReturn(user.tenantId, store.id, orderNumber);
  }

  @Post('returns')
  @RequirePermissions('pos.create')
  @ApiOperation({ summary: 'Process a return from POS' })
  async processReturn(
    @Req() req: Request,
    @Body() body: { saleId: string; items: CreateSaleDto['items']; reason: string; notes?: string },
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.processPosReturn(
      user.tenantId,
      store.id,
      user.sub,
      body.saleId,
      body,
      user.plan,
    );
  }

  @Post('exchanges')
  @RequirePermissions('pos.create')
  @ApiOperation({ summary: 'Process an exchange (return + new sale atomically)' })
  async processExchange(@Req() req: Request, @Body() dto: CreateExchangeDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.processExchange(user.tenantId, store.id, user.sub, dto, user.plan);
  }

  @Post('loyalty/redeem-preview')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Preview loyalty points redemption discount' })
  async loyaltyRedeemPreview(@Req() req: Request, @Body() dto: LoyaltyRedeemPreviewDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.loyaltyRedeemPreview(
      user.tenantId,
      store.id,
      dto.customerId,
      dto.points,
    );
  }

  @Post('shifts/open')
  @RequirePermissions('pos.create')
  @ApiOperation({ summary: 'Open a cashier shift' })
  async openShift(@Req() req: Request, @Body() dto: OpenShiftDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.shiftService.openShift(user.tenantId, store.id, user.sub, dto);
  }

  @Post('shifts/:id/close')
  @RequirePermissions('pos.create')
  @ApiOperation({ summary: 'Close a cashier shift with counted cash' })
  async closeShift(@Req() req: Request, @Param('id') id: string, @Body() dto: CloseShiftDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.shiftService.closeShift(user.tenantId, store.id, id, dto);
  }

  @Get('shifts/current')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Get active shift for current cashier' })
  @ApiQuery({ name: 'terminalId', required: false })
  async getCurrentShift(@Req() req: Request, @Query('terminalId') terminalId?: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.shiftService.getCurrentShift(user.tenantId, store.id, user.sub, terminalId);
  }

  @Get('shifts')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'List shift history' })
  async listShifts(@Req() req: Request, @Query() query: Record<string, string>) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.shiftService.listShifts(user.tenantId, store.id, query);
  }

  @Get('shifts/:id/z-report')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Z-report for a shift (JSON + HTML)' })
  async getZReport(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.shiftService.getZReport(user.tenantId, store.id, id);
  }

  @Get('customers/search')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Quick customer search' })
  @ApiQuery({ name: 'q', required: true })
  async searchCustomers(@Req() req: Request, @Query('q') query: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.searchCustomers(user.tenantId, store.id, query);
  }

  @Get('receipts/:saleId')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Get receipt data for a sale' })
  async getReceipt(@Req() req: Request, @Param('saleId') saleId: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.getReceipt(user.tenantId, store.id, saleId);
  }

  @Get('settings')
  @RequirePermissions('pos.view')
  @ApiOperation({ summary: 'Get POS terminal settings' })
  @ApiQuery({ name: 'terminalId', required: false })
  async getSettings(@Req() req: Request, @Query('terminalId') terminalId?: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.getSettings(user.tenantId, store.id, terminalId);
  }

  @Put('settings')
  @RequirePermissions('pos.settings')
  @ApiOperation({ summary: 'Update POS terminal settings' })
  @ApiQuery({ name: 'terminalId', required: false })
  async updateSettings(
    @Req() req: Request,
    @Body() dto: UpdatePosSettingsDto,
    @Query('terminalId') terminalId?: string,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.posService.updateSettings(user.tenantId, store.id, dto, terminalId);
  }
}
