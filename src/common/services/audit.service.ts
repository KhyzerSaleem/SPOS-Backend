import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../../database/schemas/audit-log.schema';

export interface AuditLogInput {
  tenantId: string;
  storeId?: string | null;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.auditModel.create({
        tenantId: new Types.ObjectId(input.tenantId),
        storeId: input.storeId ? new Types.ObjectId(input.storeId) : null,
        userId: new Types.ObjectId(input.userId),
        userName: input.userName,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId || '',
        summary: input.summary,
        before: input.before ?? null,
        after: input.after ?? null,
        ip: input.ip || '',
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  async list(
    tenantId: string,
    query: {
      page?: number;
      limit?: number;
      entity?: string;
      action?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };

    if (query.entity) filter.entity = query.entity;
    if (query.action) filter.action = query.action;
    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) (filter.createdAt as any).$gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        (filter.createdAt as any).$lte = end;
      }
    }

    const [data, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) || 1 };
  }

  async exportCsv(tenantId: string, query: Record<string, string>) {
    const { data } = await this.list(tenantId, { ...query, page: 1, limit: 5000 });
    const header = 'Date,User,Action,Entity,Entity ID,Summary,IP';
    const rows = data.map((row) => {
      const cols = [
        row.createdAt ? new Date(row.createdAt).toISOString() : '',
        row.userName || '',
        row.action || '',
        row.entity || '',
        row.entityId || '',
        (row.summary || '').replace(/"/g, '""'),
        row.ip || '',
      ];
      return cols.map((c) => `"${c}"`).join(',');
    });
    return [header, ...rows].join('\n');
  }
}
