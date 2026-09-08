import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { BankReconciliationService } from './bank-reconciliation.service';
import { SaveReconciliationDto } from './dto/save-reconciliation.dto';

@ApiTags('Finance — Bank Reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('finance')
@Controller('finance/reconciliation')
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  @Get('accounts')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'List reconcilable (asset/bank) accounts with balances' })
  async listAccounts(@Req() req: Request) {
    const user = req.user as any;
    return this.service.listBankAccounts(user.tenantId);
  }

  @Get('workspace/:accountId')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Reconciliation workspace for one account' })
  @ApiQuery({ name: 'statementDate', required: false })
  async workspace(
    @Req() req: Request,
    @Param('accountId') accountId: string,
    @Query('statementDate') statementDate?: string,
  ) {
    const user = req.user as any;
    return this.service.getWorkspace(user.tenantId, accountId, statementDate);
  }

  @Post()
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Create or update the open reconciliation draft' })
  async save(@Req() req: Request, @Body() dto: SaveReconciliationDto) {
    const user = req.user as any;
    return this.service.save(user.tenantId, user.sub, dto);
  }

  @Patch(':id/complete')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Complete a reconciliation (must reconcile to zero)' })
  async complete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.service.complete(user.tenantId, id, user.sub);
  }

  @Get()
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Reconciliation history' })
  @ApiQuery({ name: 'accountId', required: false })
  async list(@Req() req: Request, @Query('accountId') accountId?: string) {
    const user = req.user as any;
    return this.service.list(user.tenantId, accountId);
  }

  @Delete(':id')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Discard an open reconciliation draft' })
  async discard(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.service.discardDraft(user.tenantId, id);
  }
}
