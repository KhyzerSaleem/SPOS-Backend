import { Types } from 'mongoose';
import { Model } from 'mongoose';
import { DepartmentDocument } from '../schemas/department.schema';

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  'full-time': 'full-time',
  'full time': 'full-time',
  fulltime: 'full-time',
  'part-time': 'part-time',
  'part time': 'part-time',
  contract: 'contract',
  intern: 'intern',
};

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  inactive: 'terminated',
  'on leave': 'on-leave',
  'on-leave': 'on-leave',
  terminated: 'terminated',
  resigned: 'resigned',
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeEmploymentType(value?: string): string {
  if (!value) return 'full-time';
  const key = normalizeKey(value);
  return EMPLOYMENT_TYPE_MAP[key] || 'full-time';
}

export function normalizeEmployeeStatus(value?: string): string {
  if (!value) return 'active';
  const key = normalizeKey(value);
  return STATUS_MAP[key] || 'active';
}

export function employmentTypeLabel(value?: string): string {
  const map: Record<string, string> = {
    'full-time': 'Full-time',
    'part-time': 'Part-time',
    contract: 'Contract',
    intern: 'Intern',
  };
  return map[value || ''] || value || 'Full-time';
}

export function statusLabel(value?: string): string {
  const map: Record<string, string> = {
    active: 'Active',
    'on-leave': 'On Leave',
    terminated: 'Terminated',
    resigned: 'Inactive',
  };
  return map[value || ''] || 'Active';
}

function parseSalary(dto: Record<string, unknown>): Record<string, number> | undefined {
  if (dto.salary && typeof dto.salary === 'object' && !Array.isArray(dto.salary)) {
    const s = dto.salary as Record<string, number>;
    const basic = Number(s.basic) || 0;
    const allowances = Number(s.allowances) || 0;
    const deductions = Number(s.deductions) || 0;
    const net = Number(s.net) || basic + allowances - deductions;
    return { basic, allowances, deductions, net };
  }

  const raw = dto.salaryAmount ?? dto.salary;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const basic = Number(raw);
  if (Number.isNaN(basic)) return undefined;
  return { basic, allowances: 0, deductions: 0, net: basic };
}

export async function resolveDepartmentId(
  tenantId: string,
  dto: Record<string, unknown>,
  departmentModel: Model<DepartmentDocument>,
): Promise<Types.ObjectId | undefined> {
  if (dto.departmentId && Types.ObjectId.isValid(String(dto.departmentId))) {
    return new Types.ObjectId(String(dto.departmentId));
  }
  const name = dto.department as string | undefined;
  if (!name?.trim()) return undefined;

  let dept = await departmentModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });
  if (!dept) {
    dept = await departmentModel.create({
      name: name.trim(),
      tenantId: new Types.ObjectId(tenantId),
      description: '',
      isActive: true,
    });
  }
  return dept._id as Types.ObjectId;
}

export async function mapEmployeeCreatePayload(
  tenantId: string,
  dto: Record<string, unknown>,
  departmentModel: Model<DepartmentDocument>,
): Promise<Record<string, unknown>> {
  const departmentId = await resolveDepartmentId(tenantId, dto, departmentModel);
  const salary = parseSalary(dto);
  const joining = (dto.joiningDate || dto.dateOfJoining) as string | undefined;

  const bankName = (dto.bankName as string) || (dto.bankDetails as any)?.bankName || '';
  const accountNumber =
    (dto.accountNumber as string) || (dto.bankDetails as any)?.accountNumber || '';
  const ifscCode = (dto.ifscCode as string) || (dto.bankDetails as any)?.ifscCode || '';
  const routingNumber = (dto.bankDetails as any)?.routingNumber || ifscCode || '';

  const emergencyName = (dto.emergencyName as string) || (dto.emergencyContact as any)?.name || '';
  const emergencyPhone =
    (dto.emergencyPhone as string) || (dto.emergencyContact as any)?.phone || '';
  const emergencyRelation =
    (dto.emergencyRelation as string) || (dto.emergencyContact as any)?.relation || '';

  // Guard against a missing email becoming the literal string "undefined":
  // String(undefined) === 'undefined', which would then be stored and, being
  // non-empty, silently pass the required (tenantId, email) unique index.
  const email =
    dto.email === undefined || dto.email === null || String(dto.email).trim() === ''
      ? ''
      : String(dto.email).toLowerCase().trim();

  const payload: Record<string, unknown> = {
    firstName: dto.firstName,
    lastName: dto.lastName,
    email,
    phone: dto.phone || '',
    designation: dto.designation || '',
    employmentType: normalizeEmploymentType(dto.employmentType as string),
    status: normalizeEmployeeStatus(dto.status as string),
    address: dto.address || '',
  };

  if (departmentId) payload.departmentId = departmentId;
  if (joining) payload.dateOfJoining = new Date(joining);
  if (dto.dateOfLeaving) payload.dateOfLeaving = new Date(dto.dateOfLeaving as string);
  if (dto.storeId && Types.ObjectId.isValid(String(dto.storeId))) {
    payload.storeId = new Types.ObjectId(String(dto.storeId));
  }
  if (dto.userId && Types.ObjectId.isValid(String(dto.userId))) {
    payload.userId = new Types.ObjectId(String(dto.userId));
  }
  if (salary) payload.salary = salary;
  if (bankName || accountNumber || routingNumber) {
    payload.bankDetails = { bankName, accountNumber, routingNumber, ifscCode };
  }
  if (emergencyName || emergencyPhone || emergencyRelation) {
    payload.emergencyContact = {
      name: emergencyName,
      phone: emergencyPhone,
      relation: emergencyRelation,
    };
  }

  return payload;
}

export function formatEmployeeForClient(emp: Record<string, any>): Record<string, any> {
  const dept = emp.departmentId;
  const departmentName =
    typeof dept === 'object' && dept !== null ? dept.name : emp.department || '';

  const storeRef = emp.storeId;
  const storeName =
    typeof storeRef === 'object' && storeRef !== null ? storeRef.name : emp.storeName || '';
  const storeIdStr =
    typeof storeRef === 'object' && storeRef !== null
      ? (storeRef._id?.toString?.() ?? storeRef._id)
      : (emp.storeId?.toString?.() ?? emp.storeId ?? '');

  const userRef = emp.userId;
  const portalRole =
    typeof userRef === 'object' && userRef !== null && userRef.role
      ? userRef.role
      : emp.portalRole || '';

  return {
    ...emp,
    _id: emp._id?.toString?.() ?? emp._id,
    storeId: storeIdStr,
    storeName,
    portalRole,
    hasPortalAccount: !!(userRef || emp.userId),
    department: departmentName,
    joiningDate: emp.dateOfJoining,
    employmentType: employmentTypeLabel(emp.employmentType),
    status: statusLabel(emp.status),
    salary: emp.salary?.basic ?? emp.salary?.net ?? '',
    bankName: emp.bankDetails?.bankName ?? '',
    accountNumber: emp.bankDetails?.accountNumber ?? '',
    ifscCode: emp.bankDetails?.ifscCode ?? emp.bankDetails?.routingNumber ?? '',
    emergencyName: emp.emergencyContact?.name ?? '',
    emergencyPhone: emp.emergencyContact?.phone ?? '',
    emergencyRelation: emp.emergencyContact?.relation ?? '',
    address: emp.address ?? '',
  };
}
