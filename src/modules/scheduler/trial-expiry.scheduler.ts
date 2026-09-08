import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscription, SubscriptionDocument } from '../../database/schemas/subscription.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { EmailService } from '../../common/services/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationRunnerService } from './automation-runner.service';
import { isAutomationEnabled } from './automation.util';

/** Send trial expiry emails at these days remaining (inclusive). */
const NOTIFY_AT_DAYS = [3, 1, 0] as const;

@Injectable()
export class TrialExpiryScheduler {
  private readonly logger = new Logger(TrialExpiryScheduler.name);

  constructor(
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private automationRunner: AutomationRunnerService,
  ) {}

  /** Daily at 09:00 UTC — trial expiry reminders at 3 days, 1 day, and on expiry day. */
  @Cron('0 9 * * *', { name: 'trial-expiry-notifications', timeZone: 'UTC' })
  async sendTrialExpiryReminders(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('trial-expiry-notifications', () =>
      this.runTrialExpiryReminders(),
    );
  }

  private async runTrialExpiryReminders(): Promise<{
    summary: string;
    processed: number;
    notified: number;
    skipped: number;
  }> {
    const subs = await this.subscriptionModel
      .find({ status: 'trial', trialEndsAt: { $ne: null } })
      .select('tenantId trialEndsAt trialExpiryNotificationsSent')
      .lean();

    let sent = 0;
    let skipped = 0;

    for (const sub of subs) {
      const trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
      if (!trialEndsAt) continue;

      const daysLeft = this.calendarDaysUntil(trialEndsAt);
      const threshold = NOTIFY_AT_DAYS.find((d) => d === daysLeft);
      if (threshold === undefined) {
        skipped++;
        continue;
      }

      const alreadySent: number[] = sub.trialExpiryNotificationsSent ?? [];
      if (alreadySent.includes(threshold)) {
        skipped++;
        continue;
      }

      const tenant = await this.tenantModel
        .findById(sub.tenantId)
        .select('name isActive')
        .lean<{ name: string; isActive?: boolean }>();
      if (!tenant?.isActive) continue;

      const owners = await this.userModel
        .find({ tenantId: sub.tenantId, role: 'owner', isActive: true })
        .select('email fullName _id')
        .lean<{ email: string; fullName: string; _id: unknown }[]>();

      if (!owners.length) {
        this.logger.warn(`No owner email for tenant ${sub.tenantId} — skipping trial reminder`);
        continue;
      }

      const expiryDate = trialEndsAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      for (const owner of owners) {
        await this.emailService
          .sendTrialExpiryReminder(owner.email, {
            name: owner.fullName || 'there',
            tenantName: tenant.name,
            daysLeft: threshold,
            expiryDate,
          })
          .catch((err) =>
            this.logger.error(`Email failed for ${owner.email}: ${err?.message ?? err}`),
          );

        await this.notificationsService
          .notifySubscriptionExpiring(String(sub.tenantId), String(owner._id), threshold)
          .catch(() => {});
      }

      await this.subscriptionModel.updateOne(
        { _id: sub._id },
        { $addToSet: { trialExpiryNotificationsSent: threshold } },
      );
      sent++;
    }

    return {
      summary: `${sent} tenant(s) notified, ${skipped} skipped`,
      processed: sent,
      notified: sent,
      skipped,
    };
  }

  /** Whole calendar days from today (UTC midnight) until the expiry date. */
  private calendarDaysUntil(expiryDate: Date): number {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = new Date(expiryDate);
    end.setUTCHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86_400_000);
  }
}
