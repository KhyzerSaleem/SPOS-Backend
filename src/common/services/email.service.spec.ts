import { EmailService } from './email.service';

describe('EmailService — send() reliability wiring', () => {
  function makeService(configOverrides: Record<string, string> = {}) {
    const configService = { get: jest.fn((key: string) => configOverrides[key]) };
    const queueService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const createdDoc = { _id: 'log-1' };
    const deliveryLogModel = {
      create: jest.fn().mockResolvedValue(createdDoc),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    const service = new EmailService(
      configService as any,
      queueService as any,
      deliveryLogModel as any,
    );
    return { service, configService, queueService, deliveryLogModel };
  }

  it('creates a delivery-log row before enqueueing, so a failure is never invisible', async () => {
    const { service, deliveryLogModel, queueService } = makeService();

    await service.sendOtpCode('owner@example.com', '123456');

    expect(deliveryLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        templateType: 'otp',
        status: 'queued',
      }),
    );
    expect(queueService.enqueue).toHaveBeenCalledWith(
      'email',
      'send',
      expect.objectContaining({ logId: 'log-1', to: 'owner@example.com' }),
    );
  });

  it('routes .local addresses to ADMIN_EMAIL and records that as the actual recipient in the log', async () => {
    const { service, deliveryLogModel } = makeService({ ADMIN_EMAIL: 'devkinesis@gmail.com' });

    await service.sendOtpCode('owner@tenant.local', '654321');

    expect(deliveryLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'devkinesis@gmail.com' }),
    );
  });

  it('marks the log failed if enqueue() itself throws, without letting the error escape the caller', async () => {
    const { service, deliveryLogModel, queueService } = makeService();
    queueService.enqueue.mockRejectedValue(new Error('Redis connection reset'));

    await expect(service.sendOtpCode('owner@example.com', '123456')).resolves.toBeUndefined();

    expect(deliveryLogModel.updateOne).toHaveBeenCalledWith(
      { _id: 'log-1' },
      { $set: { status: 'failed', lastError: 'Redis connection reset' } },
    );
  });
});
