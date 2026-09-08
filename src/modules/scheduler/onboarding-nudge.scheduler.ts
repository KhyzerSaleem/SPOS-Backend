import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { EmailService } from '../../common/services/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationRunnerService } from './automation-runner.service';
import { isAutomationEnabled } from './automation.util';

const ONBOARDING_NUDGE_DAYS = 3;

@Injectable()
export class OnboardingNudgeScheduler {
  private readonly logger = new Logger(OnboardingNudgeScheduler.name);

  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 10 * * *', { name: 'onboarding-nudge', timeZone: 'UTC' })
  async sendOnboardingNudges(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('onboarding-nudge', () => this.runOnboardingNudges());
  }

  private async runOnboardingNudges(): Promise<{
    summary: string;
    processed: number;
    notified: number;
    skipped: number;
  }> {
    const cutoff = new Date(Date.now() - ONBOARDING_NUDGE_DAYS * 86_400_000);

    const tenants = await this.tenantModel
      .find({
        isActive: true,
        createdAt: { $lte: cutoff },
        'settings.onboardingCompleted': false,
        'settings.onboardingNudgeSent': { $ne: true },
      })
      .select('_id name settings createdAt')
      .lean();

    let processed = 0;
    let notified = 0;
    let skipped = 0;

    for (const tenant of tenants) {
      const tenantId = String(tenant._id);
      const [storeCount, productCount] = await Promise.all([
        this.storeModel.countDocuments({ tenantId: tenant._id, isActive: true }),
        this.productModel.countDocuments({ tenantId: tenant._id, deletedAt: null }),
      ]);

      const needsNudge = storeCount === 0 || productCount === 0;
      if (!needsNudge) {
        await this.tenantModel.updateOne(
          { _id: tenant._id },
          { $set: { 'settings.onboardingNudgeSent': true } },
        );
        skipped++;
        continue;
      }

      const owners = await this.userModel
        .find({ tenantId: tenant._id, role: 'owner', isActive: true })
        .select('_id email fullName')
        .lean<{ _id: Types.ObjectId; email: string; fullName: string }[]>();

      if (!owners.length) {
        skipped++;
        continue;
      }

      const missing: string[] = [];
      if (storeCount === 0) missing.push('store');
      if (productCount === 0) missing.push('products');

      for (const owner of owners) {
        await this.emailService
          .sendOnboardingNudge(owner.email, {
            name: owner.fullName || 'there',
            tenantName: tenant.name,
            missingSteps: missing,
            daysSinceSignup: ONBOARDING_NUDGE_DAYS,
          })
          .catch((err) =>
            this.logger.error(`Onboarding nudge failed for ${owner.email}: ${err?.message ?? err}`),
          );

        await this.notificationsService
          .notifyOnboardingNudge(tenantId, String(owner._id), missing)
          .catch(() => {});
        notified++;
      }

      await this.tenantModel.updateOne(
        { _id: tenant._id },
        { $set: { 'settings.onboardingNudgeSent': true } },
      );
      processed++;
    }

    return {
      summary: `Onboarding nudges sent to ${processed} tenant(s)`,
      processed,
      notified,
      skipped,
    };
  }
}
