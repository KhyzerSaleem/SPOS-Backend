import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AutomationRun, AutomationRunDocument } from '../../database/schemas/automation-run.schema';
import { AUTOMATION_JOBS, AutomationJobDefinition } from './automation.constants';

export interface AutomationJobResult {
  summary?: string;
  processed?: number;
  notified?: number;
  skipped?: number;
  errors?: number;
  status?: 'success' | 'skipped';
}

@Injectable()
export class AutomationRunnerService {
  private readonly logger = new Logger(AutomationRunnerService.name);

  constructor(
    @InjectModel(AutomationRun.name)
    private automationRunModel: Model<AutomationRunDocument>,
  ) {}

  async run(jobName: string, handler: () => Promise<AutomationJobResult>): Promise<void> {
    const startedAt = new Date();
    try {
      const result = await handler();
      const status = result.status ?? 'success';
      await this.automationRunModel.create({
        jobName,
        status,
        startedAt,
        completedAt: new Date(),
        summary: result.summary ?? '',
        processed: result.processed ?? 0,
        notified: result.notified ?? 0,
        skipped: result.skipped ?? 0,
        errors: result.errors ?? 0,
      });
      this.logger.log(
        `Automation "${jobName}" ${status} — ${result.summary ?? 'done'} (processed=${result.processed ?? 0}, notified=${result.notified ?? 0})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.automationRunModel.create({
        jobName,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        summary: 'Job failed',
        error: message,
      });
      this.logger.error(`Automation "${jobName}" failed: ${message}`);
      throw err;
    }
  }

  async listJobStatuses(): Promise<
    Array<
      AutomationJobDefinition & {
        lastRunAt: Date | null;
        lastStatus: string | null;
        lastSummary: string | null;
        lastProcessed: number;
        lastNotified: number;
      }
    >
  > {
    const latest = await this.automationRunModel.aggregate([
      { $sort: { startedAt: -1 } },
      {
        $group: {
          _id: '$jobName',
          lastRunAt: { $first: '$startedAt' },
          lastStatus: { $first: '$status' },
          lastSummary: { $first: '$summary' },
          lastProcessed: { $first: '$processed' },
          lastNotified: { $first: '$notified' },
        },
      },
    ]);

    const byName = new Map(latest.map((r) => [r._id as string, r]));

    return AUTOMATION_JOBS.map((job) => {
      const run = byName.get(job.name);
      return {
        ...job,
        lastRunAt: run?.lastRunAt ?? null,
        lastStatus: run?.lastStatus ?? null,
        lastSummary: run?.lastSummary ?? null,
        lastProcessed: run?.lastProcessed ?? 0,
        lastNotified: run?.lastNotified ?? 0,
      };
    });
  }
}
