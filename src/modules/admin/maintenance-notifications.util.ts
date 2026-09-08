/** Notification milestone keys stored in platform_settings.maintenanceNotificationsSent */
export type MaintenanceNotifyKey =
  'advance_30d' | 'advance_7d' | 'advance_1d' | 'advance_1h' | 'started' | 'completed';

export const MAINTENANCE_ADVANCE_DAY_KEYS: MaintenanceNotifyKey[] = [
  'advance_30d',
  'advance_7d',
  'advance_1d',
];

/** Days before maintenance start for advance email + in-app alerts. */
export const MAINTENANCE_ADVANCE_DAYS: Record<'advance_30d' | 'advance_7d' | 'advance_1d', number> =
  {
    advance_30d: 30,
    advance_7d: 7,
    advance_1d: 1,
  };

export function formatMaintenanceWindowLabel(start: Date, end: Date, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone === 'UTC' ? 'UTC' : undefined,
  };
  const startLabel = start.toLocaleString('en-US', opts);
  const endLabel = end.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: opts.timeZone,
  });
  return `${startLabel} – ${endLabel} (${timezone})`;
}

export function maintenanceNotifyTitle(key: MaintenanceNotifyKey): string {
  switch (key) {
    case 'advance_30d':
      return 'Scheduled maintenance in 30 days';
    case 'advance_7d':
      return 'Scheduled maintenance in 7 days';
    case 'advance_1d':
      return 'Scheduled maintenance tomorrow';
    case 'advance_1h':
      return 'Maintenance begins in 1 hour';
    case 'started':
      return 'Maintenance in progress';
    case 'completed':
      return 'Maintenance completed';
    default:
      return 'Maintenance notice';
  }
}

export function maintenanceNotifyMessage(
  key: MaintenanceNotifyKey,
  windowLabel: string,
  noticeMessage: string,
): string {
  switch (key) {
    case 'advance_30d':
    case 'advance_7d':
    case 'advance_1d':
      return `${noticeMessage} Window: ${windowLabel}.`;
    case 'advance_1h':
      return `SwiftPOS will be unavailable in about 1 hour. ${noticeMessage}`;
    case 'started':
      return 'SwiftPOS is currently undergoing scheduled maintenance. Please check back shortly.';
    case 'completed':
      return 'Scheduled maintenance has finished. You can resume using SwiftPOS normally.';
    default:
      return noticeMessage;
  }
}
