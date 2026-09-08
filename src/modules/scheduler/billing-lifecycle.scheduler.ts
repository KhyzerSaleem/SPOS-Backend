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
import {
  calendarDaysSince,
  calendarDaysUntil,
  isAutomationEnabled,
  matchingThreshold,
} from './automation.util';

const DUNNING_DAYS = [0, 3, 7, 14] as const;
const RENEWAL_REMINDER_DAYS = [7, 3, 1] as const;
const DUNNING_SUSPEND_DAY = 14;

@Injectable()
export class BillingLifecycleScheduler {
  private readonly logger = new Logger(BillingLifecycleScheduler.name);

  constructor(
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 9 * * *', { name: 'trial-expiry-enforcement', timeZone: 'UTC' })
  async enforceExpiredTrials(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('trial-expiry-enforcement', () => this.runTrialEnforcement());
  }

  @Cron('0 9 * * *', { name: 'subscription-dunning', timeZone: 'UTC' })
  async processDunning(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('subscription-dunning', () => this.runDunning());
  }

  @Cron('0 9 * * *', { name: 'renewal-reminders', timeZone: 'UTC' })
  async sendRenewalReminders(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('renewal-reminders', () => this.runRenewalReminders());
  }

  private async runTrialEnforcement(): Promise<{
    summary: string;
    processed: number;
    notified: number;
    skipped: number;
  }> {
    const now = new Date();
    const subs = await this.subscriptionModel
      .find({ status: 'trial', trialEndsAt: { $lt: now } })
      .select('tenantId trialEndsAt')
      .lean();

    let processed = 0;
    let skipped = 0;

    for (const sub of subs) {
      const tenant = await this.tenantModel
        .findById(sub.tenantId)
        .select('name isActive')
        .lean<{ name: string; isActive?: boolean }>();
      if (!tenant?.isActive) {
        skipped++;
        continue;
      }

      // Suspend subscription only — keep tenant/users active so owners can reach billing.
      await this.subscriptionModel.updateOne({ _id: sub._id }, { $set: { status: 'suspended' } });
      processed++;
    }

    return {
      summary: `Suspended ${processed} expired trial(s)`,
      processed,
      notified: 0,
      skipped,
    };
  }

  private async runDunning(): Promise<{
    summary: string;
    processed: number;
    notified: number;
    skipped: number;
  }> {
    const subs = await this.subscriptionModel
      .find({ status: 'overdue', overdueSince: { $ne: null } })
      .select('tenantId overdueSince dunningNotificationsSent planName')
      .lean();

    let processed = 0;
    let notified = 0;
    let skipped = 0;

    for (const sub of subs) {
      const overdueSince = sub.overdueSince ? new Date(sub.overdueSince) : null;
      if (!overdueSince) {
        skipped++;
        continue;
      }

      const daysOverdue = calendarDaysSince(overdueSince);
      const threshold = matchingThreshold(daysOverdue, DUNNING_DAYS);
      if (threshold === undefined) {
        skipped++;
        continue;
      }

      const alreadySent: number[] = sub.dunningNotificationsSent ?? [];
      if (alreadySent.includes(threshold)) {
        skipped++;
        continue;
      }

      const tenant = await this.tenantModel
        .findById(sub.tenantId)
        .select('name isActive')
        .lean<{ name: string; isActive?: boolean }>();
      if (!tenant?.isActive) {
        skipped++;
        continue;
      }

      const owners = await this.getOwners(String(sub.tenantId));
      if (!owners.length) {
        this.logger.warn(`No owner for tenant ${sub.tenantId} — skipping dunning`);
        skipped++;
        continue;
      }

      const isFinal = threshold === DUNNING_SUSPEND_DAY;
      for (const owner of owners) {
        await this.emailService
          .sendDunningReminder(owner.email, {
            name: owner.fullName || 'there',
            tenantName: tenant.name,
            daysOverdue: threshold,
            planName: sub.planName || 'subscription',
            isFinalWarning: isFinal,
          })
          .catch((err) =>
            this.logger.error(`Dunning email failed for ${owner.email}: ${err?.message ?? err}`),
          );

        await this.notificationsService
          .notifyPaymentDue(
            String(sub.tenantId),
            String(owner._id),
            `BILLING-${threshold}`,
            isFinal ? 'today (final)' : `in ${DUNNING_SUSPEND_DAY - threshold} day(s)`,
          )
          .catch(() => {});
        notified++;
      }

      const update: Record<string, unknown> = {
        $addToSet: { dunningNotificationsSent: threshold },
      };
      if (isFinal) {
        update.$set = { status: 'suspended' };
      }

      await this.subscriptionModel.updateOne({ _id: sub._id }, update);
      processed++;
    }

    return {
      summary: `Dunning processed ${processed} subscription(s)`,
      processed,
      notified,
      skipped,
    };
  }

  private async runRenewalReminders(): Promise<{
    summary: string;
    processed: number;
    notified: number;
    skipped: number;
  }> {
    const subs = await this.subscriptionModel
      .find({ status: 'active', renewalDate: { $ne: null } })
      .select('tenantId renewalDate renewalRemindersSent planName')
      .lean();

    let processed = 0;
    let notified = 0;
    let skipped = 0;

    for (const sub of subs) {
      const renewalDate = sub.renewalDate ? new Date(sub.renewalDate) : null;
      if (!renewalDate) {
        skipped++;
        continue;
      }

      const daysLeft = calendarDaysUntil(renewalDate);
      const threshold = matchingThreshold(daysLeft, RENEWAL_REMINDER_DAYS);
      if (threshold === undefined) {
        skipped++;
        continue;
      }

      const alreadySent: number[] = sub.renewalRemindersSent ?? [];
      if (alreadySent.includes(threshold)) {
        skipped++;
        continue;
      }

      const tenant = await this.tenantModel
        .findById(sub.tenantId)
        .select('name isActive')
        .lean<{ name: string; isActive?: boolean }>();
      if (!tenant?.isActive) {
        skipped++;
        continue;
      }

      const owners = await this.getOwners(String(sub.tenantId));
      const renewalLabel = renewalDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      for (const owner of owners) {
        await this.emailService
          .sendPaymentReminder(owner.email, {
            invoiceNumber: `Renewal — ${sub.planName || 'plan'}`,
            amount: 0,
            dueDate: renewalLabel,
          })
          .catch((err) =>
            this.logger.error(`Renewal email failed for ${owner.email}: ${err?.message ?? err}`),
          );

        await this.notificationsService
          .notifySubscriptionExpiring(String(sub.tenantId), String(owner._id), threshold)
          .catch(() => {});
        notified++;
      }

      await this.subscriptionModel.updateOne(
        { _id: sub._id },
        { $addToSet: { renewalRemindersSent: threshold } },
      );
      processed++;
    }

    return {
      summary: `Renewal reminders sent for ${processed} subscription(s)`,
      processed,
      notified,
      skipped,
    };
  }

  private async getOwners(tenantId: string) {
    return this.userModel
      .find({ tenantId, role: 'owner', isActive: true })
      .select('email fullName _id')
      .lean<{ email: string; fullName: string; _id: unknown }[]>();
  }
}
