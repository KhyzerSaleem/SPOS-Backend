import { WebhooksController } from './webhooks.controller';

describe('WebhooksController — PayPal webhook (disabled)', () => {
  function makeController() {
    const billingService = {
      recordPayment: jest.fn(),
      markSubscriptionOverdue: jest.fn(),
      handleCheckoutCompleted: jest.fn(),
      handleSubscriptionDeleted: jest.fn(),
      handleSubscriptionUpdated: jest.fn(),
      findTenantByStripeSubscriptionId: jest.fn(),
      claimStripeWebhookEvent: jest.fn(),
    };
    const controller = new WebhooksController(billingService as any);
    return { controller, billingService };
  }

  it('never calls recordPayment even with a forged PAYMENT.SALE.COMPLETED payload', async () => {
    const { controller, billingService } = makeController();

    const forgedBody = {
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: {
        custom_id: 'attacker-chosen-tenant-id',
        amount: { total: '999999' },
        id: 'fake-transaction-id',
      },
    };

    const result = await controller.paypalWebhook(forgedBody, 'fake-transmission-id');

    expect(billingService.recordPayment).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true, processed: false });
  });

  it('never calls any billing mutation for a forged subscription-cancelled payload', async () => {
    const { controller, billingService } = makeController();

    await controller.paypalWebhook(
      { event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { custom_id: 'any-tenant' } },
      'fake-id',
    );

    expect(billingService.recordPayment).not.toHaveBeenCalled();
    expect(billingService.markSubscriptionOverdue).not.toHaveBeenCalled();
    expect(billingService.handleSubscriptionDeleted).not.toHaveBeenCalled();
  });

  it('does not throw on a malformed/empty body', async () => {
    const { controller } = makeController();
    await expect(controller.paypalWebhook(undefined, undefined as any)).resolves.toEqual({
      received: true,
      processed: false,
    });
  });
});
