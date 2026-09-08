import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { EmailService } from '../../common/services/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanLimitsService } from '../../common/services/plan-limits.service';
import { AutomationRunnerService } from './automation-runner.service';
import { isAutomationEnabled, planLimitWarningThreshold } from './automation.util';

type LimitResource = 'users' | 'stores';

@Injectable()
export class PlanLimitsScheduler {
  private readonly logger = new Logger(PlanLimitsScheduler.name);

  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private planLimitsService: PlanLimitsService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 9 * * *', { name: 'plan-limit-warnings', timeZone: 'UTC' })
  async sendPlanLimitWarnings(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('plan-limit-warnings', () => this.runPlanLimitWarnings());
  }

  private async runPlanLimitWarnings(): Promise<{
    summary: string;
    processed: number;
    notified: number;
    skipped: number;
  }> {
    const thresholdPct = planLimitWarningThreshold();
    const tenants = await this.tenantModel
      .find({ isActive: true })
      .select('_id name settings')
      .lean();

    let processed = 0;
    let notified = 0;
    let skipped = 0;

    for (const tenant of tenants) {
      const tenantId = String(tenant._id);
      const usage = await this.planLimitsService.getUsageSnapshot(tenantId);
      const warnings: Array<{ resource: LimitResource; used: number; limit: number; pct: number }> =
        [];

      for (const [resource, used, limit] of [
        ['users', usage.usersUsed, usage.maxUsers],
        ['stores', usage.storesUsed, usage.maxStores],
      ] as const) {
        if (limit <= 0 || limit >= 999) continue;
        const pct = Math.round((used / limit) * 100);
        if (pct >= thresholdPct) {
          warnings.push({ resource, used, limit, pct });
        }
      }

      if (!warnings.length) {
        skipped++;
        continue;
      }

      const sentFlags =
        (tenant.settings as { planLimitWarningsSent?: Record<string, boolean> } | undefined)
          ?.planLimitWarningsSent ?? {};

      const pending = warnings.filter((w) => !sentFlags[w.resource]);
      if (!pending.length) {
        skipped++;
        continue;
      }

      const owners = await this.userModel
        .find({ tenantId: tenant._id, role: 'owner', isActive: true })
        .select('_id email fullName')
        .lean<{ _id: unknown; email: string; fullName: string }[]>();

      if (!owners.length) {
        skipped++;
        continue;
      }

      for (const warning of pending) {
        for (const owner of owners) {
          await this.emailService
            .sendPlanLimitWarning(owner.email, {
              name: owner.fullName || 'there',
              tenantName: tenant.name,
              resource: warning.resource,
              used: warning.used,
              limit: warning.limit,
              percent: warning.pct,
            })
            .catch((err) =>
              this.logger.error(
                `Plan limit email failed for ${owner.email}: ${err?.message ?? err}`,
              ),
            );

          await this.notificationsService
            .notifyPlanLimitWarning(
              tenantId,
              String(owner._id),
              warning.resource,
              warning.used,
              warning.limit,
            )
            .catch(() => {});
          notified++;
        }

        sentFlags[warning.resource] = true;
      }

      await this.tenantModel.updateOne(
        { _id: tenant._id },
        { $set: { 'settings.planLimitWarningsSent': sentFlags } },
      );
      processed++;
    }

    return {
      summary: `Plan limit warnings for ${processed} tenant(s)`,
      processed,
      notified,
      skipped,
    };
  }
}
