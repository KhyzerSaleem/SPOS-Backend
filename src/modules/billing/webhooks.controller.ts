import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { Public } from '../../common/guards/jwt-auth.guard';
import { verifyStripeEvent } from '../../common/utils/stripe-webhook.util';

@ApiTags('Payment Webhooks')
@Public()
@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private billingService: BillingService) {}

  @Post('stripe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  async stripeWebhook(
    @Body() _body: unknown,
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const rawBody = req.rawBody;

    let event: Record<string, any>;
    try {
      if (!rawBody) {
        throw new BadRequestException('Raw body required for Stripe webhook verification');
      }
      event = verifyStripeEvent(rawBody, signature, secret || '') as Record<string, any>;
    } catch (err) {
      this.logger.error(`Stripe webhook verification failed: ${(err as Error).message}`);
      throw err;
    }

    const eventId = event.id as string | undefined;
    if (eventId) {
      const claimed = await this.billingService.claimStripeWebhookEvent(
        eventId,
        String(event.type),
      );
      if (!claimed) {
        this.logger.log(`Stripe webhook duplicate ignored: ${eventId}`);
        return { received: true, duplicate: true };
      }
    }

    this.logger.log(`Stripe webhook verified: ${event?.type}`);

    try {
      switch (event?.type) {
        case 'checkout.session.completed': {
          const session = event.data?.object;
          await this.billingService.handleCheckoutCompleted(session);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data?.object;
          let tenantId = invoice?.metadata?.tenantId;
          if (!tenantId && invoice?.subscription) {
            const sub = await this.billingService.findTenantByStripeSubscriptionId(
              invoice.subscription,
            );
            tenantId = sub?.tenantId?.toString();
          }
          if (tenantId) {
            await this.billingService.recordPayment(
              tenantId,
              (invoice.amount_paid || 0) / 100,
              'stripe',
              invoice.id,
            );
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data?.object;
          let tenantId = invoice?.metadata?.tenantId;
          if (!tenantId && invoice?.subscription) {
            const sub = await this.billingService.findTenantByStripeSubscriptionId(
              invoice.subscription,
            );
            tenantId = sub?.tenantId?.toString();
          }
          if (tenantId) {
            await this.billingService.markSubscriptionOverdue(tenantId);
            this.logger.warn(`Payment failed for tenant ${tenantId}, invoice ${invoice?.id}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data?.object;
          await this.billingService.handleSubscriptionDeleted(sub);
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data?.object;
          await this.billingService.handleSubscriptionUpdated(sub);
          break;
        }

        default:
          this.logger.log(`Unhandled Stripe event: ${event?.type}`);
      }
    } catch (err) {
      this.logger.error(`Stripe webhook handler error: ${(err as Error).message}`);
      throw err;
    }

    return { received: true };
  }

  /**
   * PayPal is not an integrated payment method (no SDK dependency, no
   * PAYPAL_CLIENT_ID/SECRET/WEBHOOK_ID anywhere in this codebase — there is no
   * checkout flow that could have produced a real custom_id/transmission-id in
   * the first place). This handler previously trusted `resource.custom_id` from
   * an UNVERIFIED request body as a tenantId and passed it straight into
   * billingService.recordPayment(), which reactivates a subscription and writes
   * a "paid" invoice. That let anyone, with no authentication, forge a payment
   * for any tenant by POSTing a crafted JSON body — confirmed in a security
   * audit. It now only logs and takes no action.
   *
   * To bring this back safely: verify the webhook via PayPal's
   * /v1/notifications/verify-webhook-signature API (mirroring
   * verifyStripeEvent's role for the Stripe handler above) using
   * PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET/PAYPAL_WEBHOOK_ID, and only then trust
   * anything in the payload.
   */
  @Post('paypal')
  @HttpCode(200)
  @ApiOperation({ summary: 'PayPal webhook endpoint (disabled — see comment)' })
  async paypalWebhook(
    @Body() body: any,
    @Headers('paypal-transmission-id') transmissionId: string,
  ) {
    this.logger.warn(
      `PayPal webhook received but ignored (no signature verification configured): ` +
        `${body?.event_type} (${transmissionId || 'no-id'})`,
    );
    return { received: true, processed: false };
  }
}
