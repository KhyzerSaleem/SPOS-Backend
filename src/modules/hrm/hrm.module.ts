import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HrmController } from './hrm.controller';
import { EmployeePortalController } from './employee-portal.controller';
import { HrmService } from './hrm.service';
import { Department, DepartmentSchema } from './schemas/department.schema';
import { Employee, EmployeeSchema } from './schemas/employee.schema';
import { Attendance, AttendanceSchema } from './schemas/attendance.schema';
import { LeaveRequest, LeaveRequestSchema } from './schemas/leave-request.schema';
import { PayrollRun, PayrollRunSchema } from './schemas/payroll-run.schema';
import { Role, RoleSchema } from '../../database/schemas/role.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Tenant, TenantSchema } from '../../database/schemas/tenant.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { RefreshToken, RefreshTokenSchema } from '../../database/schemas/refresh-token.schema';
import { EmployeeProvisioningService } from './employee-provisioning.service';
import { EmployeePortalSyncService } from './employee-portal-sync.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: PayrollRun.name, schema: PayrollRunSchema },
      { name: Role.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Store.name, schema: StoreSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [HrmController, EmployeePortalController],
  providers: [HrmService, EmployeeProvisioningService, EmployeePortalSyncService],
  exports: [HrmService, EmployeePortalSyncService],
})
export class HrmModule {}
