import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { HrmService } from './hrm.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { CreateLeaveRequestDto, RejectLeaveDto } from './dto/create-leave-request.dto';
import { GeneratePayrollDto } from './dto/generate-payroll.dto';

@ApiTags('HRM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireFeature('hrm')
@Controller('hrm')
export class HrmController {
  constructor(private hrmService: HrmService) {}

  @Get('overview')
  @RequirePermissions('hrm.view')
  @ApiOperation({ summary: 'HRM dashboard overview (stats, departments, recent leaves)' })
  async getOverview(@Req() req: Request) {
    const user = req.user as any;
    return this.hrmService.getOverview(user.tenantId);
  }

  // ── Departments ──

  @Get('departments')
  @RequirePermissions('hrm.view')
  @ApiOperation({ summary: 'List departments' })
  @ApiQuery({ name: 'search', required: false })
  async getDepartments(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.hrmService.findAllDepartments(user.tenantId, query);
  }

  @Post('departments')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Create department' })
  async createDepartment(@Req() req: Request, @Body() dto: CreateDepartmentDto) {
    const user = req.user as any;
    return this.hrmService.createDepartment(user.tenantId, dto);
  }

  @Put('departments/:id')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Update department' })
  async updateDepartment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    const user = req.user as any;
    return this.hrmService.updateDepartment(user.tenantId, id, dto);
  }

  @Delete('departments/:id')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Delete department' })
  async deleteDepartment(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hrmService.deleteDepartment(user.tenantId, id);
  }

  // ── Employees ──

  @Get('assignable-roles')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'List roles that can be assigned to new employees' })
  async getAssignableRoles(@Req() req: Request) {
    const user = req.user as any;
    return this.hrmService.getAssignableRoles(user.tenantId);
  }

  @Get('employees')
  @RequirePermissions('hrm.view')
  @ApiOperation({ summary: 'List employees (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'employmentType', required: false })
  async getEmployees(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.hrmService.findAllEmployees(user.tenantId, query);
  }

  @Post('employees/sync-portal-users')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Backfill HRM employees from existing portal users' })
  async syncPortalUsers(@Req() req: Request) {
    const user = req.user as any;
    return this.hrmService.syncPortalUsersToEmployees(user.tenantId);
  }

  @Post('employees')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Create employee' })
  async createEmployee(@Req() req: Request, @Body() dto: CreateEmployeeDto) {
    const user = req.user as any;
    return this.hrmService.createEmployee(
      user.tenantId,
      dto as unknown as Record<string, unknown>,
      { invitedBy: user.email || user.fullName || 'HR' },
    );
  }

  @Get('employees/:id')
  @RequirePermissions('hrm.view')
  @ApiOperation({ summary: 'Get employee by ID' })
  async getEmployee(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hrmService.findEmployeeById(user.tenantId, id);
  }

  @Put('employees/:id')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Update employee' })
  async updateEmployee(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeDto,
  ) {
    const user = req.user as any;
    return this.hrmService.updateEmployee(
      user.tenantId,
      id,
      dto as unknown as Record<string, unknown>,
      {
        invitedBy: user.fullName || user.email,
      },
    );
  }

  @Delete('employees/:id')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Soft delete employee (set terminated)' })
  async deleteEmployee(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hrmService.deleteEmployee(user.tenantId, id);
  }

  // ── Attendance ──

  @Get('attendance')
  @RequirePermissions('hrm.view')
  @ApiOperation({ summary: 'List attendance records' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  async getAttendance(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.hrmService.findAttendance(user.tenantId, query);
  }

  @Post('attendance')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Mark attendance' })
  async markAttendance(@Req() req: Request, @Body() dto: CreateAttendanceDto) {
    const user = req.user as any;
    return this.hrmService.markAttendance(user.tenantId, dto);
  }

  @Put('attendance/:id')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Update attendance record' })
  async updateAttendance(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateAttendanceDto,
  ) {
    const user = req.user as any;
    return this.hrmService.updateAttendance(user.tenantId, id, dto);
  }

  @Get('attendance/summary')
  @RequirePermissions('hrm.view')
  @ApiOperation({ summary: 'Monthly attendance summary per employee' })
  @ApiQuery({ name: 'month', required: true })
  @ApiQuery({ name: 'year', required: true })
  async getAttendanceSummary(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.hrmService.getAttendanceSummary(user.tenantId, query);
  }

  // ── Leave Requests ──

  @Get('leaves')
  @RequirePermissions('hrm.view')
  @ApiOperation({ summary: 'List leave requests' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'leaveType', required: false })
  async getLeaveRequests(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.hrmService.findLeaveRequests(user.tenantId, query);
  }

  @Post('leaves')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Request leave' })
  async createLeaveRequest(@Req() req: Request, @Body() dto: CreateLeaveRequestDto) {
    const user = req.user as any;
    return this.hrmService.createLeaveRequest(user.tenantId, dto);
  }

  @Patch('leaves/:id/approve')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Approve leave request' })
  async approveLeave(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hrmService.approveLeave(user.tenantId, id, user._id);
  }

  @Patch('leaves/:id/reject')
  @RequirePermissions('hrm.manage')
  @ApiOperation({ summary: 'Reject leave request' })
  async rejectLeave(@Req() req: Request, @Param('id') id: string, @Body() dto: RejectLeaveDto) {
    const user = req.user as any;
    return this.hrmService.rejectLeave(user.tenantId, id, user._id, dto.rejectedReason);
  }

  @Get('leaves/balance/:employeeId')
  @RequirePermissions('hrm.view')
  @ApiOperation({ summary: 'Get leave balance by employee' })
  async getLeaveBalance(@Req() req: Request, @Param('employeeId') employeeId: string) {
    const user = req.user as any;
    return this.hrmService.getLeaveBalance(user.tenantId, employeeId);
  }

  // ── Payroll ──

  @Get('payroll')
  @RequirePermissions('hrm.payroll')
  @ApiOperation({ summary: 'List payroll runs' })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'status', required: false })
  async getPayrollRuns(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.hrmService.findPayrollRuns(user.tenantId, query);
  }

  @Post('payroll/generate')
  @RequirePermissions('hrm.payroll')
  @ApiOperation({ summary: 'Generate payroll for month/year' })
  async generatePayroll(@Req() req: Request, @Body() dto: GeneratePayrollDto) {
    const user = req.user as any;
    return this.hrmService.generatePayroll(user.tenantId, dto, user._id);
  }

  @Get('payroll/:id')
  @RequirePermissions('hrm.payroll')
  @ApiOperation({ summary: 'Get payroll run detail with employee breakdown' })
  async getPayrollRun(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hrmService.getPayrollRun(user.tenantId, id);
  }

  @Patch('payroll/:id/process')
  @RequirePermissions('hrm.payroll')
  @ApiOperation({ summary: 'Mark payroll as processing' })
  async processPayroll(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hrmService.processPayroll(user.tenantId, id);
  }

  @Patch('payroll/:id/complete')
  @RequirePermissions('hrm.payroll')
  @ApiOperation({ summary: 'Mark payroll as completed' })
  async completePayroll(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hrmService.completePayroll(user.tenantId, id);
  }
}
