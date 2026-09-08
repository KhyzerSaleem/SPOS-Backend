import { EmailQueueProcessor } from './email-queue.processor';

describe('EmailQueueProcessor', () => {
  function makeProcessor() {
    let capturedHandler: ((data: any) => Promise<void>) | undefined;
    const queueService = {
      registerProcessor: jest.fn((_queueName: string, handler: any) => {
        capturedHandler = handler;
      }),
    };
    const emailProvider = { send: jest.fn() };
    const logModel = { updateOne: jest.fn().mockResolvedValue({}) };

    const processor = new EmailQueueProcessor(
      queueService as any,
      emailProvider as any,
      logModel as any,
    );
    processor.onModuleInit();

    return {
      processor,
      queueService,
      emailProvider,
      logModel,
      // Invoke the private process() the same way the queue (or inline
      // fallback) would — through the handler QueueService.registerProcessor
      // captured.
      runJob: (data: any) => capturedHandler!(data),
    };
  }

  it('registers itself as the "email" queue handler on module init', () => {
    const { queueService } = makeProcessor();
    expect(queueService.registerProcessor).toHaveBeenCalledWith('email', expect.any(Function));
  });

  it('marks the delivery log sent on a successful provider send', async () => {
    const { emailProvider, logModel, runJob } = makeProcessor();
    emailProvider.send.mockResolvedValue({ success: true, providerMessageId: 'msg-123' });

    await runJob({ logId: 'log-1', to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' });

    expect(emailProvider.send).toHaveBeenCalledWith('a@b.com', 'Hi', '<p>hi</p>');
    expect(logModel.updateOne).toHaveBeenCalledWith(
      { _id: 'log-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'sent', providerMessageId: 'msg-123' }),
        $inc: { attempts: 1 },
      }),
    );
  });

  it('marks the delivery log failed AND throws (to drive BullMQ retry) on provider failure', async () => {
    const { emailProvider, logModel, runJob } = makeProcessor();
    emailProvider.send.mockResolvedValue({ success: false, error: 'Brevo 500' });

    await expect(
      runJob({ logId: 'log-2', to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' }),
    ).rejects.toThrow('Brevo 500');

    expect(logModel.updateOne).toHaveBeenCalledWith(
      { _id: 'log-2' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed', lastError: 'Brevo 500' }),
        $inc: { attempts: 1 },
      }),
    );
  });
});
