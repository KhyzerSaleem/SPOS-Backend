import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
import { InventoryService } from './inventory.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateCycleCountDto, SubmitCycleCountDto } from './dto/create-cycle-count.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  // ── Warehouses ──

  @Get('warehouses')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'List warehouses' })
  @ApiQuery({ name: 'allStores', required: false, type: Boolean })
  async getWarehouses(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.findAllWarehouses(user.tenantId, store.id, query);
  }

  @Post('warehouses')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Create warehouse' })
  async createWarehouse(@Req() req: Request, @Body() dto: CreateWarehouseDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.createWarehouse(user.tenantId, store.id, dto);
  }

  @Put('warehouses/:id')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Update warehouse' })
  async updateWarehouse(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateWarehouseDto,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.updateWarehouse(user.tenantId, store.id, id, dto);
  }

  @Delete('warehouses/:id')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Delete warehouse' })
  async deleteWarehouse(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.deleteWarehouse(user.tenantId, store.id, id);
  }

  // ── Stock ──

  @Get('stock')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get stock overview' })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getStock(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.getStock(user.tenantId, store.id, query);
  }

  // ── Adjustments ──

  @Get('adjustments')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'List stock adjustments' })
  async getAdjustments(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.getAdjustments(user.tenantId, store.id, query);
  }

  @Post('adjustments')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Create stock adjustment' })
  async createAdjustment(@Req() req: Request, @Body() dto: CreateAdjustmentDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.createAdjustment(user.tenantId, store.id, user.sub, dto, {
      userName: user.fullName || user.email,
    });
  }

  // ── Transfers ──

  @Get('transfers')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'List transfers' })
  async getTransfers(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.getTransfers(user.tenantId, store.id, query);
  }

  @Post('transfers')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Create transfer' })
  async createTransfer(@Req() req: Request, @Body() dto: CreateTransferDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.createTransfer(user.tenantId, store.id, user.sub, dto);
  }

  @Put('transfers/:id/status')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Update transfer status (ship/complete)' })
  async updateTransferStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.updateTransferStatus(
      user.tenantId,
      store.id,
      user.sub,
      id,
      body.status,
    );
  }

  // ── Batches ──

  @Get('batches')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'List batches' })
  @ApiQuery({ name: 'search', required: false })
  async getBatches(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.getBatches(user.tenantId, store.id, query);
  }

  @Post('batches')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Create batch' })
  async createBatch(@Req() req: Request, @Body() dto: CreateBatchDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.createBatch(user.tenantId, store.id, dto);
  }

  @Put('batches/:id')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Update batch' })
  async updateBatch(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.updateBatch(user.tenantId, store.id, id, body);
  }

  // ── Cycle Counts ──

  @Get('cycle-counts')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'List cycle counts' })
  async getCycleCounts(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.getCycleCounts(user.tenantId, store.id, query);
  }

  @Post('cycle-counts')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Create cycle count' })
  async createCycleCount(@Req() req: Request, @Body() dto: CreateCycleCountDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.createCycleCount(user.tenantId, store.id, user.sub, dto);
  }

  @Post('cycle-counts/:id/submit')
  @RequirePermissions('inventory.manage')
  @ApiOperation({ summary: 'Submit cycle count results' })
  async submitCycleCount(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: SubmitCycleCountDto,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.submitCycleCount(user.tenantId, store.id, user.sub, id, dto);
  }

  // ── Dead Stock ──

  @Get('dead-stock')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get dead stock and damaged items' })
  async getDeadStock(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.getDeadStock(user.tenantId, store.id, query);
  }

  // ── Reorder Alerts ──

  @Get('reorder-alerts')
  @RequirePermissions('inventory.view')
  @ApiOperation({ summary: 'Get products below reorder point' })
  async getReorderAlerts(@Req() req: Request) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.inventoryService.getReorderAlerts(user.tenantId, store.id);
  }
}
