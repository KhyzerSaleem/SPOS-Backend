import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac } from 'crypto';
import {
  WebhookSubscription,
  WebhookSubscriptionDocument,
  WebhookEvent,
} from '../../database/schemas/webhook-subscription.schema';
import { assertPublicHttpUrl } from '../utils/ssrf-guard.util';

@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    @InjectModel(WebhookSubscription.name)
    private webhookModel: Model<WebhookSubscriptionDocument>,
  ) {}

  /** Best-effort async dispatch — does not block caller. */
  emit(tenantId: string, event: WebhookEvent, payload: Record<string, unknown>): void {
    void this.dispatch(tenantId, event, payload);
  }

  private async dispatch(
    tenantId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const subs = await this.webhookModel
        .find({
          tenantId: new Types.ObjectId(tenantId),
          isActive: true,
          events: event,
        })
        .lean();

      if (!subs.length) return;

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      await Promise.allSettled(
        subs.map(async (sub) => {
          // Re-validate immediately before dispatch, not just at registration
          // time: a DNS record can be re-pointed at a private/internal address
          // after the URL passed validation at creation (DNS rebinding), and
          // this is the actual moment our server makes the request.
          try {
            await assertPublicHttpUrl(sub.url);
          } catch (err) {
            this.logger.warn(
              `Webhook ${sub._id} URL failed SSRF validation, skipping delivery: ${(err as Error).message}`,
            );
            await this.webhookModel.updateOne(
              { _id: sub._id },
              { $set: { lastFailedAt: new Date(), lastError: 'URL failed safety validation' } },
            );
            return;
          }

          const signature = createHmac('sha256', sub.secret).update(body).digest('hex');
          let lastError = '';
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
              const res = await fetch(sub.url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-SwiftPOS-Signature': signature,
                  'X-SwiftPOS-Event': event,
                  'X-SwiftPOS-Delivery-Attempt': String(attempt),
                },
                body,
                signal: AbortSignal.timeout(10_000),
              });
              await this.webhookModel.updateOne(
                { _id: sub._id },
                {
                  $inc: { deliveryAttempts: 1 },
                  $set: {
                    lastResponseStatus: res.status,
                    ...(res.ok
                      ? { lastDeliveredAt: new Date(), lastError: '' }
                      : { lastFailedAt: new Date(), lastError: `HTTP ${res.status}` }),
                  },
                },
              );
              if (res.ok) return;
              lastError = `HTTP ${res.status}`;
            } catch (error) {
              lastError = (error as Error).message;
              await this.webhookModel.updateOne(
                { _id: sub._id },
                {
                  $inc: { deliveryAttempts: 1 },
                  $set: { lastFailedAt: new Date(), lastError, lastResponseStatus: null },
                },
              );
            }
            await new Promise((resolve) => setTimeout(resolve, attempt * 500));
          }
          this.logger.warn(`Webhook ${sub._id} failed for event ${event}: ${lastError}`);
        }),
      );
    } catch (err) {
      this.logger.error(`Webhook dispatch failed: ${(err as Error).message}`);
    }
  }
}
