import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
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
import { FinanceService } from './finance.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { VoidJournalEntryDto } from './dto/void-journal-entry.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateFinancialPeriodDto } from './dto/create-financial-period.dto';

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('finance')
@Controller('finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  // ─── Accounts ──────────────────────────────────────────────

  @Get('accounts')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'List all accounts (chart of accounts)' })
  async findAllAccounts(@Req() req: Request) {
    const user = req.user as any;
    return this.financeService.findAllAccounts(user.tenantId);
  }

  @Post('accounts')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Create a new account' })
  async createAccount(@Req() req: Request, @Body() dto: CreateAccountDto) {
    const user = req.user as any;
    return this.financeService.createAccount(user.tenantId, dto);
  }

  @Put('accounts/:id')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Update an account' })
  async updateAccount(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    const user = req.user as any;
    return this.financeService.updateAccount(user.tenantId, id, dto);
  }

  @Delete('accounts/:id')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Delete an account' })
  async deleteAccount(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.financeService.deleteAccount(user.tenantId, id);
  }

  // ─── Journal Entries ───────────────────────────────────────

  @Get('journal')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'List journal entries with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async findAllJournalEntries(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.findAllJournalEntries(user.tenantId, store.id, query);
  }

  @Post('journal')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Create a journal entry' })
  async createJournalEntry(@Req() req: Request, @Body() dto: CreateJournalEntryDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.createJournalEntry(user.tenantId, store.id, user.sub, dto);
  }

  @Get('journal/:id')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Get a journal entry by ID' })
  async findJournalEntryById(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.findJournalEntryById(user.tenantId, store.id, id);
  }

  @Patch('journal/:id/post')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Post a draft journal entry' })
  async postJournalEntry(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.postJournalEntry(user.tenantId, store.id, id, user.sub);
  }

  @Patch('journal/:id/void')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Void a posted journal entry' })
  async voidJournalEntry(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto?: Partial<VoidJournalEntryDto>,
  ) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.voidJournalEntry(
      user.tenantId,
      store.id,
      id,
      user.sub,
      dto?.voidReason ?? '',
    );
  }

  // ─── Expenses ──────────────────────────────────────────────

  @Get('expenses')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'List expenses with pagination and filters' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentStatus', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async findAllExpenses(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.findAllExpenses(user.tenantId, store.id, query);
  }

  @Post('expenses')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Create an expense' })
  async createExpense(@Req() req: Request, @Body() dto: CreateExpenseDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.createExpense(user.tenantId, store.id, user.sub, dto);
  }

  @Put('expenses/:id')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Update an expense' })
  async updateExpense(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.updateExpense(user.tenantId, store.id, id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Delete an expense' })
  async deleteExpense(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.deleteExpense(user.tenantId, store.id, id);
  }

  @Patch('expenses/:id/approve')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Approve a pending expense' })
  async approveExpense(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.approveExpense(user.tenantId, store.id, id, user.sub);
  }

  @Patch('expenses/:id/reject')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Reject a pending expense' })
  async rejectExpense(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.rejectExpense(user.tenantId, store.id, id);
  }

  @Get('summary')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Finance summary for current month' })
  async getSummary(@Req() req: Request) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.getSummary(user.tenantId, store.id);
  }

  @Get('chart/revenue-expenses')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Last 12 months revenue vs expenses' })
  async getRevenueExpensesChart(@Req() req: Request) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.financeService.getRevenueExpensesChart(user.tenantId, store.id);
  }

  // ─── Reports ───────────────────────────────────────────────

  @Get('profit-loss')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Profit & Loss report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async getProfitLoss(@Req() req: Request, @Query('from') from: string, @Query('to') to: string) {
    const user = req.user as any;
    return this.financeService.getProfitLoss(user.tenantId, from, to);
  }

  @Get('reports/profit-loss')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Profit & Loss report (frontend shape)' })
  @ApiQuery({ name: 'dateFrom', required: true })
  @ApiQuery({ name: 'dateTo', required: true })
  async getProfitLossFrontend(
    @Req() req: Request,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    const user = req.user as any;
    const r = await this.financeService.getProfitLoss(user.tenantId, dateFrom, dateTo);

    return {
      revenue:
        (r as any).revenue?.map((x: any) => ({
          accountId: x.accountId,
          account: x.name,
          amount: x.amount,
        })) ?? [],
      expenses:
        (r as any).expenses?.map((x: any) => ({
          accountId: x.accountId,
          account: x.name,
          amount: x.amount,
        })) ?? [],
    };
  }

  @Get('balance-sheet')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Balance Sheet report' })
  @ApiQuery({ name: 'asOf', required: true })
  async getBalanceSheet(@Req() req: Request, @Query('asOf') asOf: string) {
    const user = req.user as any;
    return this.financeService.getBalanceSheet(user.tenantId, asOf);
  }

  @Get('reports/balance-sheet')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Balance Sheet report (frontend shape)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: true })
  async getBalanceSheetFrontend(@Req() req: Request, @Query('dateTo') dateTo: string) {
    const user = req.user as any;
    const r = await this.financeService.getBalanceSheet(user.tenantId, dateTo);

    return {
      assets:
        (r as any).assets?.map((x: any) => ({
          accountId: x.accountId,
          account: x.name,
          amount: x.balance,
        })) ?? [],
      liabilities:
        (r as any).liabilities?.map((x: any) => ({
          accountId: x.accountId,
          account: x.name,
          amount: x.balance,
        })) ?? [],
      equity:
        (r as any).equity?.map((x: any) => ({
          accountId: x.accountId,
          account: x.name,
          amount: x.balance,
        })) ?? [],
    };
  }

  @Get('cash-flow')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Cash Flow report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async getCashFlow(@Req() req: Request, @Query('from') from: string, @Query('to') to: string) {
    const user = req.user as any;
    return this.financeService.getCashFlow(user.tenantId, from, to);
  }

  @Get('reports/cash-flow')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Cash Flow report (frontend shape)' })
  @ApiQuery({ name: 'dateFrom', required: true })
  @ApiQuery({ name: 'dateTo', required: true })
  async getCashFlowFrontend(
    @Req() req: Request,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    const user = req.user as any;
    const r = await this.financeService.getCashFlow(user.tenantId, dateFrom, dateTo);

    const operating = ((r as any).cashAccounts ?? []).map((x: any) => ({
      description: x.name,
      amount: x.balance,
    }));

    return {
      operating,
      investing: [],
      financing: [],
    };
  }

  @Get('trial-balance')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Trial Balance report' })
  async getTrialBalance(@Req() req: Request) {
    const user = req.user as any;
    return this.financeService.getTrialBalance(user.tenantId);
  }

  @Get('accounts/:id/ledger')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'General ledger detail for one account (drill-down)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getAccountLedger(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user as any;
    return this.financeService.getAccountLedger(user.tenantId, id, from, to);
  }

  @Get('reports/trial-balance')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Trial Balance report (frontend shape)' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async getTrialBalanceFrontend(@Req() req: Request) {
    const user = req.user as any;
    const r = await this.financeService.getTrialBalance(user.tenantId);

    return {
      accounts:
        (r as any).accounts?.map((x: any) => ({
          accountId: x.accountId,
          code: x.code,
          account: x.name,
          debit: x.totalDebit,
          credit: x.totalCredit,
        })) ?? [],
    };
  }

  // ─── Financial Periods ─────────────────────────────────────

  @Get('periods')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'List financial periods' })
  async findAllPeriods(@Req() req: Request) {
    const user = req.user as any;
    return this.financeService.findAllPeriods(user.tenantId);
  }

  @Post('periods')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Create a financial period' })
  async createPeriod(@Req() req: Request, @Body() dto: CreateFinancialPeriodDto) {
    const user = req.user as any;
    return this.financeService.createPeriod(user.tenantId, dto);
  }

  @Patch('periods/:id/close')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Close a financial period' })
  async closePeriod(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.financeService.closePeriod(user.tenantId, id);
  }
}
