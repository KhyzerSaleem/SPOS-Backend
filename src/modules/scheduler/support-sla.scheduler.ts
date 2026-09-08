import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { ContactSubmission, ContactSubmissionDocument } from '../contact/contact.schema';
import { EmailService } from '../../common/services/email.service';
import { AutomationRunnerService, AutomationJobResult } from './automation-runner.service';
import { isAutomationEnabled } from './automation.util';

const SLA_WARNING_DAYS = 3;
const AUTO_ARCHIVE_NEW_DAYS = 14;
const AUTO_ARCHIVE_READ_DAYS = 30;

@Injectable()
export class SupportSlaScheduler {
  private readonly logger = new Logger(SupportSlaScheduler.name);

  constructor(
    @InjectModel(ContactSubmission.name)
    private contactModel: Model<ContactSubmissionDocument>,
    private emailService: EmailService,
    private configService: ConfigService,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 9 * * *', { name: 'support-sla', timeZone: 'UTC' })
  async processSupportSla(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('support-sla', () => this.runSupportSla());
  }

  private async runSupportSla(): Promise<AutomationJobResult> {
    const now = Date.now();
    const warningCutoff = new Date(now - SLA_WARNING_DAYS * 86_400_000);
    const archiveNewCutoff = new Date(now - AUTO_ARCHIVE_NEW_DAYS * 86_400_000);
    const archiveReadCutoff = new Date(now - AUTO_ARCHIVE_READ_DAYS * 86_400_000);

    const staleNew = await this.contactModel
      .find({ status: 'new', createdAt: { $lt: warningCutoff } })
      .select('subject email name createdAt')
      .lean();

    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    let notified = 0;

    if (adminEmail && staleNew.length) {
      await this.emailService
        .sendSupportSlaAlert(adminEmail, {
          ticketCount: staleNew.length,
          oldestDays: SLA_WARNING_DAYS,
          tickets: staleNew.slice(0, 10).map((t) => ({
            subject: t.subject || 'No subject',
            email: t.email,
            name: t.name,
          })),
        })
        .catch((err) => this.logger.error(`Support SLA email failed: ${err?.message ?? err}`));
      notified = 1;
    }

    const [archivedNew, archivedRead] = await Promise.all([
      this.contactModel.updateMany(
        { status: 'new', createdAt: { $lt: archiveNewCutoff } },
        { $set: { status: 'archived', notes: 'Auto-archived: no response within SLA window' } },
      ),
      this.contactModel.updateMany(
        { status: 'read', createdAt: { $lt: archiveReadCutoff } },
        { $set: { status: 'archived', notes: 'Auto-archived: stale read ticket' } },
      ),
    ]);

    const archived = (archivedNew.modifiedCount ?? 0) + (archivedRead.modifiedCount ?? 0);

    const nothingDone = staleNew.length === 0 && archived === 0;

    return {
      summary: nothingDone
        ? 'No support SLA actions needed'
        : `${staleNew.length} stale ticket(s) flagged, ${archived} archived`,
      processed: archived,
      notified,
      skipped: nothingDone ? 1 : 0,
      status: nothingDone ? 'skipped' : 'success',
    };
  }
}
