import { Worker } from 'bullmq';
import { QueueService } from './queue.service';

// Mock bullmq/ioredis entirely — these tests verify QueueService's own routing
// logic (queued vs inline), not BullMQ/Redis internals.
const mockAdd = jest.fn().mockResolvedValue(undefined);
const mockQueueClose = jest.fn().mockResolvedValue(undefined);
const mockWorkerOn = jest.fn();
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    close: mockQueueClose,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: mockWorkerOn,
    close: mockWorkerClose,
  })),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));

function makeService(redisUrl?: string) {
  const configService = { get: jest.fn().mockReturnValue(redisUrl) } as any;
  return new QueueService(configService);
}

describe('QueueService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('without REDIS_URL (fail-soft / inline mode)', () => {
    it('reports disabled', () => {
      const service = makeService(undefined);
      expect(service.isEnabled).toBe(false);
    });

    it('runs the registered handler inline for enqueue()', async () => {
      const service = makeService(undefined);
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerProcessor('email', handler);

      await service.enqueue('email', 'send', { to: 'a@b.com' });

      expect(handler).toHaveBeenCalledWith({ to: 'a@b.com' });
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('does not construct a BullMQ Worker when Redis is not configured', () => {
      const service = makeService(undefined);
      service.registerProcessor('email', jest.fn());
      const { Worker: WorkerMock } = jest.requireMock<{ Worker: typeof Worker }>('bullmq');
      expect(WorkerMock).not.toHaveBeenCalled();
    });

    it('swallows an inline handler failure instead of rejecting the caller', async () => {
      const service = makeService(undefined);
      const handler = jest.fn().mockRejectedValue(new Error('boom'));
      service.registerProcessor('email', handler);

      // Must resolve, not throw — matches BullMQ's own fire-and-forget
      // semantics for the queued path (queue.add() never rejects on handler
      // failure either).
      await expect(service.enqueue('email', 'send', {})).resolves.toBeUndefined();
      expect(handler).toHaveBeenCalled();
    });

    it('logs and no-ops when no handler is registered for the queue', async () => {
      const service = makeService(undefined);
      await expect(service.enqueue('unregistered-queue', 'job', {})).resolves.toBeUndefined();
    });
  });

  describe('with REDIS_URL configured (queued mode)', () => {
    it('reports enabled', () => {
      const service = makeService('redis://localhost:6379');
      expect(service.isEnabled).toBe(true);
    });

    it('routes enqueue() through the BullMQ queue instead of calling the handler directly', async () => {
      const service = makeService('redis://localhost:6379');
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerProcessor('email', handler);

      await service.enqueue('email', 'send', { to: 'a@b.com' });

      expect(mockAdd).toHaveBeenCalledWith(
        'send',
        { to: 'a@b.com' },
        expect.objectContaining({ attempts: 3 }),
      );
      // The handler runs via the Worker, not directly from enqueue().
      expect(handler).not.toHaveBeenCalled();
    });

    it('constructs a BullMQ Worker for the queue on registerProcessor', () => {
      const service = makeService('redis://localhost:6379');
      service.registerProcessor('email', jest.fn());
      const { Worker: WorkerMock } = jest.requireMock<{ Worker: typeof Worker }>('bullmq');
      expect(WorkerMock).toHaveBeenCalledWith('email', expect.any(Function), expect.any(Object));
    });

    it('respects custom attempts/backoff options', async () => {
      const service = makeService('redis://localhost:6379');
      service.registerProcessor('email', jest.fn());

      await service.enqueue('email', 'send', {}, { attempts: 5, backoffMs: 1000 });

      expect(mockAdd).toHaveBeenCalledWith(
        'send',
        {},
        expect.objectContaining({ attempts: 5, backoff: { type: 'exponential', delay: 1000 } }),
      );
    });
  });
});
