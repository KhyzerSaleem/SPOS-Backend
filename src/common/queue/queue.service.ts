import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

type Handler<T> = (data: T) => Promise<void>;

/**
 * Thin BullMQ wrapper that is the single fail-soft seam for every background
 * job in the app: if REDIS_URL is configured, work is queued durably with
 * retry/backoff; if it isn't, the exact same handler runs inline, immediately
 * — today's fire-and-forget behavior. No caller needs its own try/catch or
 * fallback branch, and there is no duplicated "what does the job do" logic
 * between the queued and inline paths, because both run registerProcessor's
 * handler.
 *
 * Deliberately never throws or requires REDIS_URL at boot — a missing/broken
 * Redis degrades to inline processing (no retry, no durability) rather than
 * crashing the app. See env.validation.ts for why that matters here.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly redisUrl?: string;
  private connection?: IORedis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly inlineHandlers = new Map<string, Handler<any>>();

  constructor(private configService: ConfigService) {
    this.redisUrl = this.configService.get<string>('REDIS_URL');
    if (this.redisUrl) {
      this.logger.log('REDIS_URL configured — background jobs are queued with retry/backoff');
    } else {
      this.logger.warn(
        'REDIS_URL not set — background jobs run inline with no retry/durability (add REDIS_URL to enable queueing)',
      );
    }
  }

  get isEnabled(): boolean {
    return !!this.redisUrl;
  }

  private connect(): IORedis {
    if (!this.connection) {
      // maxRetriesPerRequest: null is required by BullMQ's blocking connections.
      this.connection = new IORedis(this.redisUrl as string, { maxRetriesPerRequest: null });
      this.connection.on('error', (err) => {
        this.logger.error(`Redis connection error: ${err.message}`);
      });
    }
    return this.connection;
  }

  private getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connect() });
      this.queues.set(name, queue);
    }
    return queue;
  }

  /**
   * Registers the handler that performs the actual work for `queueName`. Call
   * this once per queue, at provider construction time (i.e. app boot), before
   * any enqueue() calls can happen at runtime. When Redis is configured this
   * also starts a BullMQ Worker consuming the queue.
   */
  registerProcessor<T>(
    queueName: string,
    handler: Handler<T>,
    opts?: { concurrency?: number },
  ): void {
    this.inlineHandlers.set(queueName, handler);
    if (!this.isEnabled) return;

    const worker = new Worker(queueName, async (job: Job) => handler(job.data), {
      connection: this.connect(),
      concurrency: opts?.concurrency ?? 5,
    });
    worker.on('failed', (job, err) => {
      this.logger.warn(
        `Job ${job?.id ?? '?'} on queue "${queueName}" failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
      );
    });
    worker.on('error', (err) => {
      this.logger.error(`Worker error on queue "${queueName}": ${err.message}`);
    });
    this.workers.set(queueName, worker);
  }

  /**
   * Enqueues work for `queueName`. Routes through BullMQ (durable, retried
   * with exponential backoff) when Redis is configured; otherwise runs the
   * registered handler directly, inline.
   *
   * Fire-and-forget in both paths, by design: queue.add() resolves once the
   * job is accepted, not once it's processed, and handler failures surface via
   * the 'failed' worker event rather than rejecting the caller's await. The
   * inline path mirrors that intentionally — a handler that throws (e.g. to
   * drive BullMQ's retry logic when queued) must not also reject enqueue()'s
   * caller when running inline, or every caller would need its own redundant
   * try/catch just to behave the same in both configurations.
   */
  async enqueue<T>(
    queueName: string,
    jobName: string,
    data: T,
    opts?: { attempts?: number; backoffMs?: number },
  ): Promise<void> {
    if (this.isEnabled) {
      const queue = this.getQueue(queueName);
      await queue.add(jobName, data, {
        attempts: opts?.attempts ?? 3,
        backoff: { type: 'exponential', delay: opts?.backoffMs ?? 5000 },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      });
      return;
    }

    const handler = this.inlineHandlers.get(queueName);
    if (!handler) {
      this.logger.error(
        `No handler registered for queue "${queueName}" — job "${jobName}" dropped`,
      );
      return;
    }
    try {
      await handler(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Inline job "${jobName}" on queue "${queueName}" failed: ${message}`);
    }
  }

  async onModuleDestroy() {
    for (const worker of this.workers.values()) await worker.close();
    for (const queue of this.queues.values()) await queue.close();
    await this.connection?.quit();
  }
}
