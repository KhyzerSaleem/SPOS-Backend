import { PlatformSettings } from '../../database/schemas/platform-settings.schema';

export type MaintenanceState = {
  active: boolean;
  upcoming: boolean;
  manual: boolean;
  scheduled: boolean;
  message: string;
  estimate: string;
  apologyMessage: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  timezone: string;
};

const DEFAULT_APOLOGY =
  'We apologize for the disruption to your workflow during this window. Thank you for your patience while we improve SwiftPOS.';

export function resolveMaintenanceState(
  settings: PlatformSettings | Record<string, unknown>,
): MaintenanceState {
  const s = settings as PlatformSettings;
  const now = Date.now();
  const message =
    s.maintenanceMessage ||
    'We are performing scheduled maintenance to improve your experience. The system will be back online shortly.';
  const estimate = s.maintenanceEstimate || 'Less than 30 minutes';
  const apologyMessage = s.maintenanceApologyMessage || DEFAULT_APOLOGY;
  const timezone = s.maintenanceTimezone || 'UTC';

  const startRaw = s.maintenanceScheduledStart;
  const endRaw = s.maintenanceScheduledEnd;
  const start = startRaw ? new Date(startRaw).getTime() : NaN;
  const end = endRaw ? new Date(endRaw).getTime() : NaN;
  const hasSchedule = Number.isFinite(start) && Number.isFinite(end) && end > start;

  const manual = Boolean(s.maintenanceMode);
  const inScheduledWindow = hasSchedule && now >= start && now <= end;
  const active = manual || (hasSchedule && s.maintenanceAutoEnable !== false && inScheduledWindow);
  const upcoming = !active && hasSchedule && s.maintenanceShowNotice !== false && now < start;

  return {
    active,
    upcoming,
    manual,
    scheduled: hasSchedule && (inScheduledWindow || upcoming),
    message,
    estimate,
    apologyMessage,
    scheduledStart: startRaw ? new Date(startRaw).toISOString() : null,
    scheduledEnd: endRaw ? new Date(endRaw).toISOString() : null,
    timezone,
  };
}
