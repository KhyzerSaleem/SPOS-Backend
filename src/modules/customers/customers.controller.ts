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
import { CustomersService } from './customers.service';

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('groups')
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'List customer groups' })
  findGroups(@Req() req: Request) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.findGroups(user.tenantId, store.id);
  }

  @Post('groups')
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Create customer group' })
  createGroup(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.createGroup(user.tenantId, store.id, body);
  }

  @Put('groups/:id')
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Update customer group' })
  updateGroup(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.updateGroup(user.tenantId, store.id, id, body);
  }

  @Delete('groups/:id')
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Delete customer group' })
  deleteGroup(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.deleteGroup(user.tenantId, store.id, id);
  }

  @Get()
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'List customers' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Req() req: Request, @Query() query: Record<string, string>) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.findAll(user.tenantId, store.id, query);
  }

  @Get(':id/sales')
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'Customer sales history' })
  findSales(@Req() req: Request, @Param('id') id: string, @Query() query: Record<string, string>) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.findSales(user.tenantId, store.id, id, query);
  }

  @Get(':id/loyalty')
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'Customer loyalty balance' })
  getLoyalty(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.getLoyalty(user.tenantId, store.id, id);
  }

  @Post(':id/loyalty/adjust')
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Adjust customer loyalty points' })
  adjustLoyalty(@Req() req: Request, @Param('id') id: string, @Body() body: { points?: number }) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.adjustLoyalty(user.tenantId, store.id, id, body);
  }

  @Get(':id/credit')
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'Customer credit account' })
  getCredit(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.getCredit(user.tenantId, store.id, id);
  }

  @Post(':id/payments')
  @RequirePermissions('customers.manage')
  @ApiOperation({ summary: 'Record customer payment' })
  recordPayment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.recordPayment(user.tenantId, store.id, id, body);
  }

  @Get(':id/payments')
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'Customer payment history' })
  findPayments(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.findPayments(user.tenantId, store.id, id, query);
  }

  @Get(':id')
  @RequirePermissions('customers.view')
  @ApiOperation({ summary: 'Get customer' })
  findOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.findOne(user.tenantId, store.id, id);
  }

  @Post()
  @RequirePermissions('customers.create')
  @ApiOperation({ summary: 'Create customer' })
  create(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.create(user.tenantId, store.id, body);
  }

  @Put(':id')
  @RequirePermissions('customers.edit')
  @ApiOperation({ summary: 'Update customer' })
  update(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.update(user.tenantId, store.id, id, body);
  }

  @Delete(':id')
  @RequirePermissions('customers.delete')
  @ApiOperation({ summary: 'Delete customer' })
  delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.delete(user.tenantId, store.id, id, user.sub);
  }

  @Post(':id/restore')
  @RequirePermissions('customers.delete')
  @ApiOperation({ summary: 'Restore soft-deleted customer' })
  restore(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.customersService.restore(user.tenantId, store.id, id);
  }
}
