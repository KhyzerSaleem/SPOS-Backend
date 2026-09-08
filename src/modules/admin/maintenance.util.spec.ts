import { resolveMaintenanceState } from './maintenance.util';

function settings(overrides: Record<string, unknown> = {}) {
  return {
    maintenanceMode: false,
    maintenanceMessage: 'Test message',
    maintenanceEstimate: '30 minutes',
    maintenanceAutoEnable: true,
    maintenanceShowNotice: true,
    maintenanceTimezone: 'UTC',
    ...overrides,
  };
}

describe('resolveMaintenanceState', () => {
  const now = Date.now();
  const hour = 3_600_000;

  it('returns active=false when no schedule and manual off', () => {
    const state = resolveMaintenanceState(settings());
    expect(state.active).toBe(false);
    expect(state.upcoming).toBe(false);
  });

  it('returns active=true when maintenanceMode is manual', () => {
    const state = resolveMaintenanceState(settings({ maintenanceMode: true }));
    expect(state.active).toBe(true);
    expect(state.manual).toBe(true);
  });

  it('returns upcoming=true before scheduled window', () => {
    const state = resolveMaintenanceState(
      settings({
        maintenanceScheduledStart: new Date(now + 2 * hour),
        maintenanceScheduledEnd: new Date(now + 4 * hour),
      }),
    );
    expect(state.upcoming).toBe(true);
    expect(state.active).toBe(false);
  });

  it('returns active=true during scheduled window with auto-enable', () => {
    const state = resolveMaintenanceState(
      settings({
        maintenanceScheduledStart: new Date(now - hour),
        maintenanceScheduledEnd: new Date(now + hour),
      }),
    );
    expect(state.active).toBe(true);
    expect(state.upcoming).toBe(false);
  });

  it('returns active=false after scheduled window ends', () => {
    const state = resolveMaintenanceState(
      settings({
        maintenanceScheduledStart: new Date(now - 4 * hour),
        maintenanceScheduledEnd: new Date(now - 2 * hour),
      }),
    );
    expect(state.active).toBe(false);
    expect(state.upcoming).toBe(false);
  });

  it('respects maintenanceAutoEnable=false during window', () => {
    const state = resolveMaintenanceState(
      settings({
        maintenanceScheduledStart: new Date(now - hour),
        maintenanceScheduledEnd: new Date(now + hour),
        maintenanceAutoEnable: false,
      }),
    );
    expect(state.active).toBe(false);
  });
});
