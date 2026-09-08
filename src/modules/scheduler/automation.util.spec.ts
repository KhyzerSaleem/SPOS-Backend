import {
  calendarDaysSince,
  calendarDaysUntil,
  heldOrderMaxAgeDays,
  isAutomationEnabled,
  matchingThreshold,
  planLimitWarningThreshold,
  softDeleteRetentionDays,
} from './automation.util';

describe('automation.util', () => {
  describe('calendarDaysUntil', () => {
    it('returns 0 for today', () => {
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      expect(calendarDaysUntil(today)).toBe(0);
    });

    it('returns positive days for future dates', () => {
      const future = new Date();
      future.setUTCDate(future.getUTCDate() + 3);
      expect(calendarDaysUntil(future)).toBe(3);
    });
  });

  describe('calendarDaysSince', () => {
    it('returns days elapsed since a past date', () => {
      const past = new Date();
      past.setUTCDate(past.getUTCDate() - 7);
      expect(calendarDaysSince(past)).toBe(7);
    });
  });

  describe('matchingThreshold', () => {
    it('returns exact threshold match only', () => {
      expect(matchingThreshold(3, [0, 3, 7, 14] as const)).toBe(3);
      expect(matchingThreshold(5, [0, 3, 7, 14] as const)).toBeUndefined();
    });
  });

  describe('isAutomationEnabled', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('is disabled in test environment', () => {
      process.env.NODE_ENV = 'test';
      expect(isAutomationEnabled()).toBe(false);
    });

    it('respects AUTOMATION_ENABLED=false', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTOMATION_ENABLED = 'false';
      expect(isAutomationEnabled()).toBe(false);
    });
  });

  describe('retention helpers', () => {
    it('uses defaults for held orders and soft delete', () => {
      delete process.env.HELD_ORDER_MAX_AGE_DAYS;
      delete process.env.SOFT_DELETE_RETENTION_DAYS;
      delete process.env.PLAN_LIMIT_WARNING_PERCENT;
      expect(heldOrderMaxAgeDays()).toBe(7);
      expect(softDeleteRetentionDays()).toBe(90);
      expect(planLimitWarningThreshold()).toBe(80);
    });
  });
});
