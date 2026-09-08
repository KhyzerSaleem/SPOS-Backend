import { Types } from 'mongoose';
import { EmployeePortalSyncService } from './employee-portal-sync.service';

function findChain(rows: any[]) {
  return { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(rows) };
}

describe('EmployeePortalSyncService.nextEmployeeIdForTenant', () => {
  const tenantId = new Types.ObjectId().toString();

  function makeService(rows: any[]) {
    const employeeModel = { find: jest.fn().mockReturnValue(findChain(rows)) };
    const service = new EmployeePortalSyncService(employeeModel as any, {} as any, {} as any);
    return { service, employeeModel };
  }

  it('starts at EMP-001 when the tenant has no employees', async () => {
    const { service } = makeService([]);
    expect(await service.nextEmployeeIdForTenant(tenantId)).toBe('EMP-001');
  });

  it('returns max + 1, not last-created + 1 (rows are returned out of numeric order)', async () => {
    // Simulates a bulk migration where createdAt order differs from id order —
    // the old sort({createdAt:-1}) logic would pick an arbitrary row and could
    // regenerate an existing id. Max-based generation is order-independent.
    const { service } = makeService([
      { employeeId: 'EMP-002' },
      { employeeId: 'EMP-005' },
      { employeeId: 'EMP-001' },
      { employeeId: 'EMP-003' },
    ]);
    expect(await service.nextEmployeeIdForTenant(tenantId)).toBe('EMP-006');
  });

  it('pads to three digits and keeps counting past 999', async () => {
    const { service } = makeService([{ employeeId: 'EMP-999' }]);
    expect(await service.nextEmployeeIdForTenant(tenantId)).toBe('EMP-1000');
  });

  it('ignores non-EMP-formatted ids instead of resetting to 1 (the old bug)', async () => {
    // A legacy/imported row whose id does not match EMP-#### must not cause the
    // generator to fall back to EMP-001 and collide with an existing EMP-001.
    const { service } = makeService([
      { employeeId: 'LEGACY-XYZ' },
      { employeeId: 'EMP-001' },
      { employeeId: 'EMP-002' },
    ]);
    expect(await service.nextEmployeeIdForTenant(tenantId)).toBe('EMP-003');
  });
});
