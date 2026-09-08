import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Department, DepartmentDocument } from './schemas/department.schema';
import {
  mapEmployeeCreatePayload,
  formatEmployeeForClient,
  normalizeEmployeeStatus,
  normalizeEmploymentType,
} from './utils/employee-payload.util';
import { EmployeeProvisioningService } from './employee-provisioning.service';
import { EmployeePortalSyncService } from './employee-portal-sync.service';
import { escapeRegex } from '../../common/utils/regex.util';
import { Employee, EmployeeDocument } from './schemas/employee.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Attendance, AttendanceDocument } from './schemas/attendance.schema';
import { LeaveRequest, LeaveRequestDocument } from './schemas/leave-request.schema';
import { PayrollRun, PayrollRunDocument } from './schemas/payroll-run.schema';
import {
  isHrmSelfServiceEligible,
  selfServiceIneligibleMessage,
} from './utils/hrm-self-service.util';

const LEAVE_ENTITLEMENTS: Record<string, number> = {
  annual: 20,
  sick: 10,
  casual: 5,
  maternity: 90,
  paternity: 15,
  unpaid: 365,
  other: 5,
};

@Injectable()
export class HrmService {
  constructor(
    @InjectModel(Department.name) private departmentModel: Model<DepartmentDocument>,
    @InjectModel(Employee.name) private employeeModel: Model<EmployeeDocument>,
    @InjectModel(Attendance.name) private attendanceModel: Model<AttendanceDocument>,
    @InjectModel(LeaveRequest.name) private leaveRequestModel: Model<LeaveRequestDocument>,
    @InjectModel(PayrollRun.name) private payrollRunModel: Model<PayrollRunDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly employeeProvisioning: EmployeeProvisioningService,
    private readonly employeePortalSync: EmployeePortalSyncService,
  ) {}

  private normalizeName(value: unknown, field: string) {
    const text = String(value || '').trim();
    if (!text) throw new BadRequestException(`${field} is required`);
    return text;
  }

  private calculateHours(checkIn?: unknown, checkOut?: unknown) {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(checkIn as any);
    const end = new Date(checkOut as any);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid attendance time');
    }
    if (end <= start) {
      throw new BadRequestException('Check-out must be after check-in');
    }
    return Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100;
  }

  private normalizePayrollPeriod(monthValue: any, yearValue: any) {
    const month = Number(monthValue);
    const year = Number(yearValue);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Payroll month must be between 1 and 12');
    }
    if (!Number.isInteger(year) || year < 2000) {
      throw new BadRequestException('Payroll year is invalid');
    }
    return { month, year };
  }

  syncPortalUsersToEmployees(tenantId: string) {
    return this.employeePortalSync.syncAllPortalUsersForTenant(tenantId);
  }

  getAssignableRoles(tenantId: string) {
    return this.employeeProvisioning.getAssignableRoles(tenantId);
  }

  /** Dashboard stats for /hrm overview page */
  async getOverview(tenantId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const activeStatuses = ['active', 'on-leave'];

    const [
      totalEmployees,
      presentToday,
      onLeaveStatusCount,
      onLeaveTodayCount,
      openPositions,
      deptCounts,
      departments,
      recentLeavesRaw,
    ] = await Promise.all([
      this.employeeModel.countDocuments({
        tenantId,
        status: { $in: activeStatuses },
      }),
      this.attendanceModel.countDocuments({
        tenantId,
        date: { $gte: todayStart, $lt: todayEnd },
        status: { $in: ['present', 'late', 'half-day'] },
      }),
      this.employeeModel.countDocuments({ tenantId, status: 'on-leave' }),
      this.leaveRequestModel.countDocuments({
        tenantId,
        status: 'approved',
        startDate: { $lte: todayEnd },
        endDate: { $gte: todayStart },
      }),
      this.departmentModel.countDocuments({
        tenantId,
        isActive: true,
        $or: [{ managerId: { $exists: false } }, { managerId: null }],
      }),
      this.employeeModel.aggregate([
        {
          $match: {
            tenantId: new Types.ObjectId(tenantId),
            status: { $in: activeStatuses },
          },
        },
        { $group: { _id: '$departmentId', employeeCount: { $sum: 1 } } },
      ]),
      this.departmentModel
        .find({ tenantId, isActive: { $ne: false } })
        .sort({ name: 1 })
        .lean(),
      this.leaveRequestModel
        .find({ tenantId })
        .populate('employeeId', 'firstName lastName employeeId')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const countByDept = new Map<string, number>();
    let unassignedCount = 0;
    for (const row of deptCounts) {
      if (!row._id) {
        unassignedCount += row.employeeCount;
        continue;
      }
      countByDept.set(String(row._id), row.employeeCount);
    }

    const departmentBreakdown = departments.map((d: any) => ({
      _id: String(d._id),
      name: d.name,
      employeeCount: countByDept.get(String(d._id)) || 0,
    }));

    if (unassignedCount > 0) {
      departmentBreakdown.push({
        _id: 'unassigned',
        name: 'Unassigned',
        employeeCount: unassignedCount,
      });
    }

    const recentLeaves = recentLeavesRaw.map((leave: any) => {
      const emp = leave.employeeId;
      const employeeName = emp
        ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.employeeId
        : 'Unknown';
      return {
        _id: String(leave._id),
        employeeName,
        leaveType: leave.leaveType,
        days: leave.totalDays,
        status: leave.status,
        startDate: leave.startDate,
        endDate: leave.endDate,
      };
    });

    return {
      stats: {
        totalEmployees,
        presentToday,
        onLeave: Math.max(onLeaveStatusCount, onLeaveTodayCount),
        openPositions,
      },
      departments: departmentBreakdown,
      recentLeaves,
    };
  }

  // ── Departments ──

  async findAllDepartments(tenantId: string, query: any): Promise<any> {
    const filter: any = { tenantId };
    if (query.search) filter.name = { $regex: query.search, $options: 'i' };
    const data = await this.departmentModel
      .find(filter)
      .populate('managerId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
    return { data };
  }

  async createDepartment(tenantId: string, dto: any): Promise<any> {
    const name = this.normalizeName(dto.name, 'Department name');
    const exists = await this.departmentModel.findOne({ tenantId, name });
    if (exists) throw new BadRequestException('Department name already exists');
    return this.departmentModel.create({ ...dto, name, tenantId });
  }

  async updateDepartment(tenantId: string, id: string, dto: any): Promise<any> {
    const dept = await this.departmentModel.findOneAndUpdate(
      { _id: id, tenantId },
      {
        $set: {
          ...dto,
          ...(dto.name !== undefined
            ? { name: this.normalizeName(dto.name, 'Department name') }
            : {}),
        },
      },
      { new: true },
    );
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async deleteDepartment(tenantId: string, id: string): Promise<any> {
    const empCount = await this.employeeModel.countDocuments({
      tenantId,
      departmentId: id,
      status: { $ne: 'terminated' },
    });
    if (empCount > 0)
      throw new BadRequestException('Cannot delete department with active employees');
    await this.departmentModel.deleteOne({ _id: id, tenantId });
    return { deleted: true };
  }

  // ── Employees ──

  async findAllEmployees(tenantId: string, query: any): Promise<any> {
    const filter: any = { tenantId };
    if (query.departmentId) filter.departmentId = query.departmentId;
    if (query.department) {
      const dept = await this.departmentModel
        .findOne({
          tenantId,
          name: { $regex: new RegExp(`^${escapeRegex(String(query.department))}$`, 'i') },
        })
        .lean();
      if (dept) filter.departmentId = dept._id;
    }
    if (query.status) filter.status = normalizeEmployeeStatus(query.status);
    if (query.employmentType) filter.employmentType = normalizeEmploymentType(query.employmentType);
    if (query.storeId) filter.storeId = query.storeId;
    if (query.search) {
      filter.$or = [
        { firstName: { $regex: query.search, $options: 'i' } },
        { lastName: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
        { employeeId: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const total = await this.employeeModel.countDocuments(filter);
    const data = await this.employeeModel
      .find(filter)
      .populate('departmentId', 'name')
      .populate('storeId', 'name address')
      .populate('userId', 'email role fullName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const employees = data.map((e) => formatEmployeeForClient(e as Record<string, any>));
    return {
      employees,
      data: employees,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findEmployeeById(tenantId: string, id: string): Promise<any> {
    const emp = await this.employeeModel
      .findOne({ _id: id, tenantId })
      .populate('departmentId', 'name')
      .populate('storeId', 'name address')
      .populate('userId', 'email role fullName')
      .lean();
    if (!emp) throw new NotFoundException('Employee not found');
    return formatEmployeeForClient(emp as Record<string, any>);
  }

  async createEmployee(
    tenantId: string,
    dto: Record<string, unknown>,
    context?: { invitedBy?: string },
  ): Promise<any> {
    const tenantOid = new Types.ObjectId(tenantId);
    const mapped = await mapEmployeeCreatePayload(tenantId, dto, this.departmentModel);

    // Only look for an email clash when an email was actually supplied.
    // Matching on an empty string would collide with every other employee that
    // has no email and wrongly report "an employee with this email exists".
    const email = String(mapped.email ?? '').trim();
    const existing = email
      ? await this.employeeModel.findOne({ tenantId: tenantOid, email })
      : null;

    if (existing && existing.status !== 'terminated') {
      throw new BadRequestException('An employee with this email already exists');
    }

    let userId = mapped.userId as Types.ObjectId | undefined;
    const createPortal = dto.createPortalAccount !== false;
    let provisionedUserId: Types.ObjectId | null = null;

    if (createPortal && !userId) {
      if (!dto.storeId) {
        throw new BadRequestException(
          'Assign a store before creating a portal login for this employee.',
        );
      }
      const existingUser = await this.userModel.findOne({
        email: mapped.email,
        tenantId: tenantOid,
      });
      if (existingUser) {
        userId = existingUser._id as Types.ObjectId;
      } else {
        const provisioned = await this.employeeProvisioning.provisionPortalAccount({
          tenantId,
          email: String(mapped.email),
          firstName: String(mapped.firstName),
          lastName: String(mapped.lastName),
          role: (dto.role as string) || 'employee',
          storeId: dto.storeId as string,
          invitedBy: context?.invitedBy,
          sendEmail: true,
        });
        userId = provisioned.userId;
        provisionedUserId = provisioned.userId;
      }
    }

    try {
      let employeeDoc: EmployeeDocument;

      if (existing?.status === 'terminated') {
        const updated = await this.employeeModel
          .findOneAndUpdate(
            { _id: existing._id, tenantId: tenantOid },
            {
              $set: {
                ...mapped,
                status: mapped.status || 'active',
                ...(userId ? { userId } : {}),
              },
              $unset: { dateOfLeaving: 1 },
            },
            { new: true },
          )
          .populate('departmentId', 'name')
          .populate('storeId', 'name address')
          .populate('userId', 'email role fullName');
        if (!updated) throw new BadRequestException('Could not reactivate employee record');
        employeeDoc = updated as EmployeeDocument;
      } else {
        // Retry on a duplicate employeeId: nextEmployeeIdForTenant generates the
        // id, then inserts, so a concurrent create (or stale data) can still
        // collide on the (tenantId, employeeId) unique index. Regenerate and
        // retry a few times rather than surfacing a raw "record already exists".
        let created: EmployeeDocument | null = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          // offset = attempt so each retry tries a *different* id — see
          // nextEmployeeIdForTenant. Without it a stale index that is unique
          // across tenants would fail every attempt on the same number.
          const employeeId = await this.employeePortalSync.nextEmployeeIdForTenant(
            tenantId,
            attempt,
          );
          try {
            created = await this.employeeModel.create({
              ...mapped,
              employeeId,
              tenantId: tenantOid,
              ...(userId ? { userId } : {}),
            });
            break;
          } catch (err: any) {
            if (err?.code !== 11000) throw err;

            const dupFields = Object.keys(err?.keyPattern ?? err?.keyValue ?? {});
            const isDupEmployeeId =
              dupFields.includes('employeeId') || String(err?.message).includes('employeeId');

            if (isDupEmployeeId && attempt < 7) continue;

            // Anything else (most often the email index) is not solved by
            // retrying — surface which field actually collided.
            if (dupFields.includes('email')) {
              throw new BadRequestException('An employee with this email already exists');
            }
            throw err;
          }
        }
        if (!created) {
          throw new BadRequestException(
            'Could not allocate an employee ID after several attempts. This usually means a stale unique index on the employees collection — run "npm run db:repair-indexes" on the server.',
          );
        }
        const populated = await this.employeeModel
          .findById(created._id)
          .populate('departmentId', 'name')
          .populate('storeId', 'name address')
          .populate('userId', 'email role fullName');
        if (!populated) throw new BadRequestException('Employee created but could not be loaded');
        employeeDoc = populated as EmployeeDocument;
      }

      const formatted = formatEmployeeForClient(employeeDoc as unknown as Record<string, any>);
      return {
        ...formatted,
        portalAccountCreated: !!userId,
        message: userId
          ? 'Employee created and login invitation sent by email'
          : 'Employee created',
      };
    } catch (err) {
      if (provisionedUserId) {
        await this.userModel
          .deleteOne({ _id: provisionedUserId, tenantId: tenantOid })
          .catch(() => {});
      }
      throw err;
    }
  }

  async updateEmployee(
    tenantId: string,
    id: string,
    dto: Record<string, unknown>,
    context?: { invitedBy?: string },
  ): Promise<any> {
    const mapped = await mapEmployeeCreatePayload(tenantId, dto, this.departmentModel);

    const existing = await this.employeeModel.findOne({ _id: id, tenantId }).lean();
    if (!existing) throw new NotFoundException('Employee not found');

    const emp = await this.employeeModel
      .findOneAndUpdate({ _id: id, tenantId }, { $set: mapped }, { new: true })
      .populate('departmentId', 'name')
      .populate('storeId', 'name address')
      .populate('userId', 'email role fullName')
      .lean();
    if (!emp) throw new NotFoundException('Employee not found');

    const roleUpdate = typeof dto.role === 'string' ? dto.role.trim() : '';
    if (roleUpdate && existing.userId) {
      await this.employeeProvisioning.updatePortalUserRole({
        tenantId,
        userId: String(existing.userId),
        role: roleUpdate,
        storeId: (dto.storeId as string) || mapped.storeId?.toString?.(),
      });
    } else if (mapped.storeId && existing.userId) {
      await this.userModel.updateOne(
        { _id: existing.userId, tenantId },
        { $set: { storeAccess: [mapped.storeId as Types.ObjectId] } },
      );
    } else if (roleUpdate && !existing.userId && dto.createPortalAccount !== false) {
      if (!dto.storeId && !mapped.storeId) {
        throw new BadRequestException(
          'Assign a store before creating a portal login for this employee.',
        );
      }
      const provisioned = await this.employeeProvisioning.provisionPortalAccount({
        tenantId,
        email: String(mapped.email || existing.email),
        firstName: String(mapped.firstName || existing.firstName),
        lastName: String(mapped.lastName || existing.lastName),
        role: roleUpdate,
        storeId: (dto.storeId as string) || String(mapped.storeId),
        invitedBy: context?.invitedBy,
        sendEmail: true,
      });
      await this.employeeModel.updateOne(
        { _id: id, tenantId },
        { $set: { userId: provisioned.userId } },
      );
    }

    const refreshed = await this.employeeModel
      .findOne({ _id: id, tenantId })
      .populate('departmentId', 'name')
      .populate('storeId', 'name address')
      .populate('userId', 'email role fullName')
      .lean();

    return formatEmployeeForClient((refreshed || emp) as Record<string, any>);
  }

  async deleteEmployee(tenantId: string, id: string): Promise<any> {
    const emp = await this.employeeModel.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { status: 'terminated', dateOfLeaving: new Date() } },
      { new: true },
    );
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  // ── Attendance ──

  async findAttendance(tenantId: string, query: any): Promise<any> {
    const filter: any = { tenantId };
    if (query.employeeId) filter.employeeId = query.employeeId;
    if (query.date) {
      const d = new Date(query.date);
      filter.date = {
        $gte: new Date(d.setHours(0, 0, 0, 0)),
        $lte: new Date(d.setHours(23, 59, 59, 999)),
      };
    } else if (query.month && query.year) {
      const month = parseInt(query.month);
      const year = parseInt(query.year);
      filter.date = {
        $gte: new Date(year, month - 1, 1),
        $lt: new Date(year, month, 1),
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const data = await this.attendanceModel
      .find(filter)
      .populate('employeeId', 'employeeId firstName lastName')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return { data };
  }

  async markAttendance(tenantId: string, dto: any): Promise<any> {
    const employee = await this.employeeModel.findOne({ _id: dto.employeeId, tenantId });
    if (!employee) throw new NotFoundException('Employee not found');

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const existing = await this.attendanceModel.findOne({
      tenantId,
      employeeId: dto.employeeId,
      date: { $gte: date, $lt: new Date(date.getTime() + 86400000) },
    });
    if (existing) throw new BadRequestException('Attendance already marked for this date');

    const hoursWorked = this.calculateHours(dto.checkIn, dto.checkOut);

    return this.attendanceModel.create({
      employeeId: dto.employeeId,
      date,
      checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
      checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
      hoursWorked,
      status: dto.status || 'present',
      notes: dto.notes || '',
      tenantId,
    });
  }

  async updateAttendance(tenantId: string, id: string, dto: any): Promise<any> {
    // Whitelist explicitly — dto is untyped, so spreading it raw into $set would
    // let a caller overwrite tenantId (reassigning this record to another
    // tenant) or employeeId (attributing it to a different employee).
    const update: Record<string, unknown> = {};
    if (dto.checkIn !== undefined) update.checkIn = dto.checkIn ? new Date(dto.checkIn) : null;
    if (dto.checkOut !== undefined) update.checkOut = dto.checkOut ? new Date(dto.checkOut) : null;
    if (dto.status !== undefined) update.status = dto.status;
    if (dto.notes !== undefined) update.notes = dto.notes;
    if (dto.checkIn || dto.checkOut) {
      update.hoursWorked = this.calculateHours(dto.checkIn, dto.checkOut);
    }

    const att = await this.attendanceModel.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: update },
      { new: true },
    );
    if (!att) throw new NotFoundException('Attendance record not found');
    return att;
  }

  async getAttendanceSummary(tenantId: string, query: any): Promise<any> {
    const month = parseInt(query.month);
    const year = parseInt(query.year);
    if (!month || !year) throw new BadRequestException('month and year are required');

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const records = await this.attendanceModel
      .find({
        tenantId,
        date: { $gte: startDate, $lt: endDate },
      })
      .lean();

    const employeeMap: Record<
      string,
      {
        present: number;
        absent: number;
        late: number;
        halfDay: number;
        leave: number;
        holiday: number;
        totalHours: number;
      }
    > = {};

    for (const r of records) {
      const empId = r.employeeId.toString();
      if (!employeeMap[empId]) {
        employeeMap[empId] = {
          present: 0,
          absent: 0,
          late: 0,
          halfDay: 0,
          leave: 0,
          holiday: 0,
          totalHours: 0,
        };
      }
      const s = employeeMap[empId];
      switch (r.status) {
        case 'present':
          s.present++;
          break;
        case 'absent':
          s.absent++;
          break;
        case 'late':
          s.late++;
          break;
        case 'half-day':
          s.halfDay++;
          break;
        case 'leave':
          s.leave++;
          break;
        case 'holiday':
          s.holiday++;
          break;
      }
      s.totalHours += r.hoursWorked || 0;
    }

    const employees = await this.employeeModel
      .find({
        tenantId,
        _id: { $in: Object.keys(employeeMap) },
      })
      .select('employeeId firstName lastName')
      .lean();

    const empLookup: Record<string, any> = {};
    for (const e of employees) {
      empLookup[(e as any)._id.toString()] = e;
    }

    const data = Object.entries(employeeMap).map(([empId, summary]) => ({
      employeeId: empId,
      employee: empLookup[empId] || null,
      ...summary,
    }));

    return { data, month, year };
  }

  // ── Leave Requests ──

  async findLeaveRequests(tenantId: string, query: any): Promise<any> {
    const filter: any = { tenantId };
    if (query.employeeId) filter.employeeId = query.employeeId;
    if (query.status) filter.status = query.status;
    if (query.leaveType) filter.leaveType = query.leaveType;

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const total = await this.leaveRequestModel.countDocuments(filter);
    const data = await this.leaveRequestModel
      .find(filter)
      .populate('employeeId', 'employeeId firstName lastName')
      .populate('approvedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createLeaveRequest(tenantId: string, dto: any): Promise<any> {
    const employee = await this.employeeModel.findOne({ _id: dto.employeeId, tenantId });
    if (!employee) throw new NotFoundException('Employee not found');

    const overlapping = await this.leaveRequestModel.findOne({
      tenantId,
      employeeId: dto.employeeId,
      status: { $in: ['pending', 'approved'] },
      $or: [
        { startDate: { $lte: new Date(dto.endDate) }, endDate: { $gte: new Date(dto.startDate) } },
      ],
    });
    if (overlapping) throw new BadRequestException('Overlapping leave request exists');

    return this.leaveRequestModel.create({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      tenantId,
    });
  }

  async approveLeave(tenantId: string, id: string, userId: string): Promise<any> {
    const leave = await this.leaveRequestModel.findOne({ _id: id, tenantId });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'pending')
      throw new BadRequestException('Only pending leaves can be approved');

    leave.status = 'approved';
    leave.approvedBy = userId as any;
    await leave.save();
    return leave;
  }

  async rejectLeave(
    tenantId: string,
    id: string,
    userId: string,
    rejectedReason: string,
  ): Promise<any> {
    const leave = await this.leaveRequestModel.findOne({ _id: id, tenantId });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'pending')
      throw new BadRequestException('Only pending leaves can be rejected');

    leave.status = 'rejected';
    leave.approvedBy = userId as any;
    leave.rejectedReason = rejectedReason;
    await leave.save();
    return leave;
  }

  async getLeaveBalance(tenantId: string, employeeId: string): Promise<any> {
    const employee = await this.employeeModel.findOne({ _id: employeeId, tenantId });
    if (!employee) throw new NotFoundException('Employee not found');

    const currentYear = new Date().getFullYear();
    const approved = await this.leaveRequestModel
      .find({
        tenantId,
        employeeId,
        status: 'approved',
        startDate: { $gte: new Date(currentYear, 0, 1) },
        endDate: { $lt: new Date(currentYear + 1, 0, 1) },
      })
      .lean();

    const used: Record<string, number> = {};
    for (const leave of approved) {
      used[leave.leaveType] = (used[leave.leaveType] || 0) + leave.totalDays;
    }

    const balance = Object.entries(LEAVE_ENTITLEMENTS).map(([type, entitlement]) => ({
      leaveType: type,
      entitlement,
      used: used[type] || 0,
      remaining: entitlement - (used[type] || 0),
    }));

    return { employeeId, employeeName: `${employee.firstName} ${employee.lastName}`, balance };
  }

  // ── Employee self-service portal ──

  private assertSelfServiceEligible(role?: string) {
    if (!isHrmSelfServiceEligible(role)) {
      throw new ForbiddenException(selfServiceIneligibleMessage(role || ''));
    }
  }

  private async resolveEmployeeForUser(
    tenantId: string,
    userId: string,
    role?: string,
    email?: string,
    fullName?: string,
  ) {
    if (!isHrmSelfServiceEligible(role)) {
      return null;
    }

    let employee = await this.employeeModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        userId: new Types.ObjectId(userId),
      })
      .populate('departmentId', 'name')
      .populate('storeId', 'name')
      .lean();

    if (!employee && email) {
      await this.employeePortalSync.ensureEmployeeForUser({
        tenantId,
        userId: new Types.ObjectId(userId),
        email,
        fullName: fullName || email,
      });
      employee = await this.employeeModel
        .findOne({
          tenantId: new Types.ObjectId(tenantId),
          userId: new Types.ObjectId(userId),
        })
        .populate('departmentId', 'name')
        .populate('storeId', 'name')
        .lean();
    }

    return employee;
  }

  async getMyPortal(
    tenantId: string,
    userId: string,
    role?: string,
    email?: string,
    fullName?: string,
  ) {
    if (!isHrmSelfServiceEligible(role)) {
      return {
        eligible: false,
        linked: false,
        role: role || null,
        reason: 'management_account',
        message: selfServiceIneligibleMessage(role || ''),
        employee: null,
        leaveBalance: null,
      };
    }

    const employee = await this.resolveEmployeeForUser(tenantId, userId, role, email, fullName);
    if (!employee) {
      return {
        eligible: true,
        linked: false,
        role,
        employee: null,
        leaveBalance: null,
        message: 'No employee profile is linked yet. Contact HR to sync your portal account.',
      };
    }
    const balance = await this.getLeaveBalance(tenantId, String(employee._id));
    return {
      eligible: true,
      linked: true,
      role,
      employee: formatEmployeeForClient(employee as Record<string, any>),
      leaveBalance: balance,
    };
  }

  async getMyAttendance(
    tenantId: string,
    userId: string,
    query: any,
    role?: string,
    email?: string,
    fullName?: string,
  ) {
    this.assertSelfServiceEligible(role);
    const employee = await this.resolveEmployeeForUser(tenantId, userId, role, email, fullName);
    if (!employee) throw new NotFoundException('Employee profile not linked to your account');
    const result = await this.findAttendance(tenantId, {
      ...query,
      employeeId: String(employee._id),
      limit: query.limit || 60,
    });
    return { records: result.data, employeeId: String(employee._id) };
  }

  async clockIn(
    tenantId: string,
    userId: string,
    role?: string,
    email?: string,
    fullName?: string,
  ) {
    this.assertSelfServiceEligible(role);
    const employee = await this.resolveEmployeeForUser(tenantId, userId, role, email, fullName);
    if (!employee) throw new NotFoundException('Employee profile not linked to your account');

    const now = new Date();
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);

    const existing = await this.attendanceModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: employee._id,
      date: { $gte: day, $lt: new Date(day.getTime() + 86400000) },
    });

    if (existing?.checkIn) {
      throw new BadRequestException('You have already clocked in today');
    }

    if (existing) {
      existing.checkIn = now;
      existing.status = 'present';
      await existing.save();
      return existing;
    }

    return this.attendanceModel.create({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: employee._id,
      date: day,
      checkIn: now,
      status: 'present',
      hoursWorked: 0,
    });
  }

  async clockOut(
    tenantId: string,
    userId: string,
    role?: string,
    email?: string,
    fullName?: string,
  ) {
    this.assertSelfServiceEligible(role);
    const employee = await this.resolveEmployeeForUser(tenantId, userId, role, email, fullName);
    if (!employee) throw new NotFoundException('Employee profile not linked to your account');

    const now = new Date();
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);

    const record = await this.attendanceModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: employee._id,
      date: { $gte: day, $lt: new Date(day.getTime() + 86400000) },
    });

    if (!record?.checkIn) {
      throw new BadRequestException('Clock in first before clocking out');
    }
    if (record.checkOut) {
      throw new BadRequestException('You have already clocked out today');
    }

    record.checkOut = now;
    record.hoursWorked =
      Math.round(((now.getTime() - new Date(record.checkIn).getTime()) / 3600000) * 100) / 100;
    await record.save();
    return record;
  }

  async createMyLeaveRequest(
    tenantId: string,
    userId: string,
    dto: {
      leaveType: string;
      startDate: string;
      endDate: string;
      totalDays: number;
      reason?: string;
    },
    role?: string,
    email?: string,
    fullName?: string,
  ) {
    this.assertSelfServiceEligible(role);
    const employee = await this.resolveEmployeeForUser(tenantId, userId, role, email, fullName);
    if (!employee) throw new NotFoundException('Employee profile not linked to your account');
    return this.createLeaveRequest(tenantId, {
      ...dto,
      employeeId: String(employee._id),
    });
  }

  async getMyLeaveRequests(
    tenantId: string,
    userId: string,
    query: any,
    role?: string,
    email?: string,
    fullName?: string,
  ) {
    this.assertSelfServiceEligible(role);
    const employee = await this.resolveEmployeeForUser(tenantId, userId, role, email, fullName);
    if (!employee) throw new NotFoundException('Employee profile not linked to your account');
    return this.findLeaveRequests(tenantId, {
      ...query,
      employeeId: String(employee._id),
    });
  }

  // ── Payroll ──

  async findPayrollRuns(tenantId: string, query: any): Promise<any> {
    const filter: any = { tenantId };
    if (query.year) filter.year = parseInt(query.year);
    if (query.status) filter.status = query.status;

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const data = await this.payrollRunModel
      .find(filter)
      .select('-employees')
      .sort({ year: -1, month: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return { data };
  }

  async getPayrollRun(tenantId: string, id: string): Promise<any> {
    const run = await this.payrollRunModel
      .findOne({ _id: id, tenantId })
      .populate('employees.employeeId', 'employeeId firstName lastName email designation')
      .populate('processedBy', 'email')
      .lean();
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async generatePayroll(tenantId: string, dto: any, userId: string): Promise<any> {
    const { month, year } = this.normalizePayrollPeriod(dto.month, dto.year);

    const existing = await this.payrollRunModel.findOne({ tenantId, month, year });
    if (existing) throw new BadRequestException(`Payroll for ${month}/${year} already exists`);

    const activeEmployees = await this.employeeModel
      .find({
        tenantId,
        status: 'active',
      })
      .lean();

    if (activeEmployees.length === 0) throw new BadRequestException('No active employees found');

    const payrollEmployees = activeEmployees.map((emp: any) => {
      const basic = emp.salary?.basic || 0;
      const allowances = emp.salary?.allowances || 0;
      const deductions = emp.salary?.deductions || 0;
      const netPay = basic + allowances - deductions;

      return {
        employeeId: emp._id,
        basicSalary: basic,
        allowances,
        deductions,
        overtime: 0,
        bonus: 0,
        netPay,
        status: 'pending',
      };
    });

    const totalAmount = payrollEmployees.reduce((sum, e) => sum + e.netPay, 0);
    const payrollNumber = `PAY-${year}${String(month).padStart(2, '0')}-${Date.now().toString(36).toUpperCase()}`;

    return this.payrollRunModel.create({
      payrollNumber,
      month,
      year,
      status: 'draft',
      employees: payrollEmployees,
      totalAmount,
      processedBy: userId,
      tenantId,
    });
  }

  async processPayroll(tenantId: string, id: string): Promise<any> {
    const run = await this.payrollRunModel.findOne({ _id: id, tenantId });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'draft')
      throw new BadRequestException('Only draft payroll can be processed');

    run.status = 'processing';
    await run.save();
    return run;
  }

  async completePayroll(tenantId: string, id: string): Promise<any> {
    const run = await this.payrollRunModel.findOne({ _id: id, tenantId });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'processing')
      throw new BadRequestException('Only processing payroll can be completed');

    run.status = 'completed';
    run.paidDate = new Date();
    run.employees.forEach((emp: any) => {
      emp.status = 'paid';
    });
    await run.save();
    return run;
  }
}
