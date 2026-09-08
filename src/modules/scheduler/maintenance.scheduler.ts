import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformSettings,
  PlatformSettingsDocument,
} from '../../database/schemas/platform-settings.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { EmailService } from '../../common/services/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveMaintenanceState } from '../admin/maintenance.util';
import {
  formatMaintenanceWindowLabel,
  maintenanceNotifyMessage,
  maintenanceNotifyTitle,
  MAINTENANCE_ADVANCE_DAY_KEYS,
  MAINTENANCE_ADVANCE_DAYS,
  MaintenanceNotifyKey,
} from '../admin/maintenance-notifications.util';
import { AutomationRunnerService, AutomationJobResult } from './automation-runner.service';
import { isAutomationEnabled } from './automation.util';

const ONE_HOUR_MS = 3_600_000;

@Injectable()
export class MaintenanceScheduler {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(
    @InjectModel(PlatformSettings.name)
    private settingsModel: Model<PlatformSettingsDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private automationRunner: AutomationRunnerService,
  ) {}

  /** Every 5 minutes — hour-before, start, and end notifications. */
  @Cron('*/5 * * * *', { name: 'maintenance-window-transitions', timeZone: 'UTC' })
  async checkMaintenanceTransitions(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('maintenance-window-transitions', () =>
      this.runMaintenanceTransitions(),
    );
  }

  private async runMaintenanceTransitions(): Promise<AutomationJobResult> {
    const settings = await this.settingsModel.findOne({ key: 'platform' }).lean();
    if (!settings) {
      return { summary: 'No platform settings', processed: 0, notified: 0, status: 'skipped' };
    }

    const start = settings.maintenanceScheduledStart
      ? new Date(settings.maintenanceScheduledStart)
      : null;
    const end = settings.maintenanceScheduledEnd
      ? new Date(settings.maintenanceScheduledEnd)
      : null;
    if (!start || !end || end <= start) {
      return {
        summary: 'No active maintenance window',
        processed: 0,
        notified: 0,
        status: 'skipped',
      };
    }

    const now = Date.now();
    const sent: string[] = settings.maintenanceNotificationsSent ?? [];
    const windowLabel = formatMaintenanceWindowLabel(
      start,
      end,
      settings.maintenanceTimezone || 'UTC',
    );
    const noticeMessage =
      settings.maintenanceNoticeMessage ||
      'Upcoming scheduled maintenance — SwiftPOS will be temporarily unavailable.';

    const due: MaintenanceNotifyKey[] = [];

    const msUntilStart = start.getTime() - now;
    if (msUntilStart > 0 && msUntilStart <= ONE_HOUR_MS && !sent.includes('advance_1h')) {
      due.push('advance_1h');
    }

    const state = resolveMaintenanceState(settings);
    if (state.active && !sent.includes('started')) {
      due.push('started');
    }

    if (now > end.getTime() && sent.includes('started') && !sent.includes('completed')) {
      due.push('completed');
    }

    let notified = 0;
    for (const key of due) {
      const count = await this.dispatchMaintenanceAlert(settings, key, windowLabel, noticeMessage);
      notified += count;
      await this.settingsModel.updateOne(
        { key: 'platform' },
        { $addToSet: { maintenanceNotificationsSent: key } },
      );
    }

    return {
      summary: due.length ? `Dispatched ${due.length} alert(s)` : 'No transitions due',
      processed: due.length,
      notified,
      status: due.length ? 'success' : 'skipped',
    };
  }

  /** Daily at 09:00 UTC — 30, 7, and 1 day advance notices. */
  @Cron('0 9 * * *', { name: 'maintenance-advance-notices', timeZone: 'UTC' })
  async sendAdvanceMaintenanceNotices(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('maintenance-advance-notices', () =>
      this.runAdvanceMaintenanceNotices(),
    );
  }

  private async runAdvanceMaintenanceNotices(): Promise<AutomationJobResult> {
    const settings = await this.settingsModel.findOne({ key: 'platform' }).lean();
    if (!settings?.maintenanceScheduledStart || !settings.maintenanceScheduledEnd) {
      return { summary: 'No scheduled maintenance', processed: 0, notified: 0, status: 'skipped' };
    }

    const start = new Date(settings.maintenanceScheduledStart);
    const end = new Date(settings.maintenanceScheduledEnd);
    if (end <= start) {
      return {
        summary: 'Invalid maintenance window',
        processed: 0,
        notified: 0,
        status: 'skipped',
      };
    }

    const daysUntil = this.calendarDaysUntil(start);
    const sent: string[] = settings.maintenanceNotificationsSent ?? [];
    const windowLabel = formatMaintenanceWindowLabel(
      start,
      end,
      settings.maintenanceTimezone || 'UTC',
    );
    const noticeMessage =
      settings.maintenanceNoticeMessage ||
      'Upcoming scheduled maintenance — SwiftPOS will be temporarily unavailable.';

    let processed = 0;
    let notified = 0;
    for (const key of MAINTENANCE_ADVANCE_DAY_KEYS) {
      const threshold = MAINTENANCE_ADVANCE_DAYS[key];
      if (daysUntil !== threshold || sent.includes(key)) continue;

      const count = await this.dispatchMaintenanceAlert(settings, key, windowLabel, noticeMessage);
      notified += count;
      await this.settingsModel.updateOne(
        { key: 'platform' },
        { $addToSet: { maintenanceNotificationsSent: key } },
      );
      processed++;
    }

    return {
      summary: processed ? `Sent ${processed} advance notice(s)` : 'No advance notices due',
      processed,
      notified,
      status: processed ? 'success' : 'skipped',
    };
  }

  private calendarDaysUntil(target: Date): number {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = new Date(target);
    end.setUTCHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86_400_000);
  }

  private async dispatchMaintenanceAlert(
    settings: PlatformSettings,
    key: MaintenanceNotifyKey,
    windowLabel: string,
    noticeMessage: string,
  ): Promise<number> {
    const title = maintenanceNotifyTitle(key);
    const message = maintenanceNotifyMessage(key, windowLabel, noticeMessage);
    const estimate = settings.maintenanceEstimate || 'Less than 30 minutes';

    const tenants = await this.tenantModel.find({ isActive: true }).select('_id name').lean();
    let emailCount = 0;
    let notifyCount = 0;

    for (const tenant of tenants) {
      const users = await this.userModel
        .find({ tenantId: tenant._id, isActive: true })
        .select('_id email fullName role')
        .lean<{ _id: unknown; email: string; fullName: string; role: string }[]>();

      if (!users.length) continue;

      const userIds = users.map((u) => String(u._id));
      await this.notificationsService
        .notifyTenant(String(tenant._id), userIds, {
          title,
          message,
          type: key === 'completed' ? 'info' : 'alert',
          link: key === 'started' ? '/maintenance' : '/dashboard',
        })
        .catch((err) =>
          this.logger.error(`In-app notify failed for tenant ${tenant._id}: ${err?.message}`),
        );
      notifyCount += userIds.length;

      const owners = users.filter((u) => u.role === 'owner' && u.email);
      for (const owner of owners) {
        await this.emailService
          .sendMaintenanceAlert(owner.email, {
            name: owner.fullName || 'there',
            tenantName: tenant.name,
            key,
            windowLabel,
            noticeMessage: message,
            estimate,
            apologyMessage: settings.maintenanceApologyMessage,
          })
          .catch((err) =>
            this.logger.error(`Email failed for ${owner.email}: ${err?.message ?? err}`),
          );
        emailCount++;
      }
    }

    this.logger.log(
      `Maintenance alert "${key}" — ${emailCount} email(s), ${notifyCount} in-app notification(s)`,
    );
    return notifyCount;
  }
}
