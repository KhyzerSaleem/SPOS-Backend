import { isTrialWindowActive, shouldRepairTrialStatus } from './subscription-access.util';

describe('subscription-access.util', () => {
  const now = new Date('2026-06-14T00:00:00.000Z');
  const future = new Date('2026-06-20T00:00:00.000Z');
  const past = new Date('2026-06-01T00:00:00.000Z');

  it('treats a valid trial window as active even when the subscription row is stale', () => {
    const sub = { status: 'suspended', trialEndsAt: future };
    const tenant = { plan: 'trial', subscriptionEndDate: future };

    expect(isTrialWindowActive(sub, tenant, now)).toBe(true);
    expect(shouldRepairTrialStatus(sub, tenant, now)).toBe(true);
  });

  it('does not repair expired trials or paid plans as trials', () => {
    expect(
      shouldRepairTrialStatus(
        { status: 'suspended', trialEndsAt: past },
        { plan: 'trial', subscriptionEndDate: past },
        now,
      ),
    ).toBe(false);

    expect(
      shouldRepairTrialStatus(
        { status: 'suspended', trialEndsAt: future },
        { plan: 'pro', subscriptionEndDate: future },
        now,
      ),
    ).toBe(false);
  });
});
