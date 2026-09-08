import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { Request } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { PermissionsGuard, RequireFeature } from '../../common/guards/permissions.guard';

import { HrmService } from './hrm.service';

/** Self-service for staff roles (employee, cashier, etc.) — not owner/admin/manager. */

@ApiTags('HRM — My Workspace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireFeature('hrm')
@Controller('hrm/me')
export class EmployeePortalController {
  constructor(private hrmService: HrmService) {}

  private ctx(req: Request) {
    const user = req.user as any;

    return {
      tenantId: user.tenantId,

      userId: user.sub || user._id?.toString(),

      role: user.role as string,

      email: user.email,

      fullName: user.fullName || user.name,
    };
  }

  @Get()
  @ApiOperation({ summary: 'My employee profile and leave balance (staff only)' })
  async getPortal(@Req() req: Request) {
    const { tenantId, userId, role, email, fullName } = this.ctx(req);

    return this.hrmService.getMyPortal(tenantId, userId, role, email, fullName);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'My attendance history (staff only)' })
  async getAttendance(@Req() req: Request, @Query() query: any) {
    const { tenantId, userId, role, email, fullName } = this.ctx(req);

    return this.hrmService.getMyAttendance(tenantId, userId, query, role, email, fullName);
  }

  @Post('attendance/clock-in')
  @ApiOperation({ summary: 'Clock in for today (staff only)' })
  async clockIn(@Req() req: Request) {
    const { tenantId, userId, role, email, fullName } = this.ctx(req);

    return this.hrmService.clockIn(tenantId, userId, role, email, fullName);
  }

  @Post('attendance/clock-out')
  @ApiOperation({ summary: 'Clock out for today (staff only)' })
  async clockOut(@Req() req: Request) {
    const { tenantId, userId, role, email, fullName } = this.ctx(req);

    return this.hrmService.clockOut(tenantId, userId, role, email, fullName);
  }

  @Get('leaves')
  @ApiOperation({ summary: 'My leave requests (staff only)' })
  async getLeaves(@Req() req: Request, @Query() query: any) {
    const { tenantId, userId, role, email, fullName } = this.ctx(req);

    return this.hrmService.getMyLeaveRequests(tenantId, userId, query, role, email, fullName);
  }

  @Post('leaves')
  @ApiOperation({ summary: 'Apply for leave (staff only)' })
  async applyLeave(
    @Req() req: Request,

    @Body()
    body: {
      leaveType: string;

      startDate: string;

      endDate: string;

      totalDays: number;

      reason?: string;
    },
  ) {
    const { tenantId, userId, role, email, fullName } = this.ctx(req);

    return this.hrmService.createMyLeaveRequest(tenantId, userId, body, role, email, fullName);
  }
}
