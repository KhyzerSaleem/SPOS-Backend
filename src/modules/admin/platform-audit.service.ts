import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PlatformAuditLog,
  PlatformAuditLogDocument,
} from '../../database/schemas/platform-audit-log.schema';

export interface PlatformAuditInput {
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  metadata?: Record<string, unknown> | null;
  ip?: string;
}

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);
  private readonly sensitiveKeyPattern = /password|token|secret|key|authorization/i;

  constructor(
    @InjectModel(PlatformAuditLog.name)
    private readonly auditModel: Model<PlatformAuditLogDocument>,
  ) {}

  async log(input: PlatformAuditInput): Promise<void> {
    try {
      await this.auditModel.create({
        actorId: new Types.ObjectId(input.actorId),
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId || '',
        summary: input.summary,
        metadata: this.redactMetadata(input.metadata),
        ip: input.ip || '',
      });
    } catch (err) {
      this.logger.error(`Failed to write platform audit log: ${(err as Error).message}`);
      throw err;
    }
  }

  private redactMetadata(
    metadata?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!metadata) return null;
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      redacted[key] = this.sensitiveKeyPattern.test(key) ? '[REDACTED]' : value;
    }
    return redacted;
  }
}
