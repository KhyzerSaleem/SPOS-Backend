import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QueueService } from '../queue/queue.service';
import { BrevoEmailProvider } from './brevo-email-provider.service';
import {
  EmailDeliveryLog,
  EmailDeliveryLogDocument,
} from '../../database/schemas/email-delivery-log.schema';

export interface EmailJobData {
  logId: string;
  to: string;
  subject: string;
  html: string;
}

/**
 * Registers the "email" queue's handler at boot. Whether a send is queued
 * (Redis configured) or run inline (fallback), this is the code that actually
 * calls the provider and updates the delivery log — see QueueService for why
 * there's only one copy of this logic regardless of path.
 */
@Injectable()
export class EmailQueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailQueueProcessor.name);

  constructor(
    private queueService: QueueService,
    private emailProvider: BrevoEmailProvider,
    @InjectModel(EmailDeliveryLog.name) private logModel: Model<EmailDeliveryLogDocument>,
  ) {}

  onModuleInit() {
    this.queueService.registerProcessor<EmailJobData>('email', (data) => this.process(data));
  }

  private async process(data: EmailJobData): Promise<void> {
    const result = await this.emailProvider.send(data.to, data.subject, data.html);

    if (result.success) {
      await this.logModel.updateOne(
        { _id: data.logId },
        {
          $set: {
            status: 'sent',
            sentAt: new Date(),
            providerMessageId: result.providerMessageId || '',
          },
          $inc: { attempts: 1 },
        },
      );
      return;
    }

    await this.logModel.updateOne(
      { _id: data.logId },
      {
        $set: { status: 'failed', lastError: result.error || 'Unknown error' },
        $inc: { attempts: 1 },
      },
    );
    this.logger.warn(`Email send failed for log ${data.logId} (${data.to}): ${result.error}`);
    // Throw so BullMQ's retry/backoff applies when queued. When Redis is
    // absent this propagates straight to the inline caller — the same
    // fire-and-forget-but-don't-crash shape email.service.ts already had.
    throw new Error(result.error || 'Email send failed');
  }
}
