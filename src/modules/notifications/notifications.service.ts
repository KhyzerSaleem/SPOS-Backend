import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from '../../database/schemas/notification.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';

const PREFERENCE_KEYS = ['loginAlerts', 'inventoryAlerts', 'salesAlerts', 'systemUpdates'] as const;
type PreferenceKey = (typeof PREFERENCE_KEYS)[number];
export type NotificationPreferences = Record<PreferenceKey, boolean>;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /** Hard cap regardless of what the client requests — this is a user-facing list, not an export. */
  private static readonly MAX_PAGE_SIZE = 50;

  async getNotifications(
    userId: string,
    opts: { page?: number; limit?: number; category?: string } = {},
  ) {
    const limit = Math.min(Math.max(1, opts.limit ?? 20), NotificationsService.MAX_PAGE_SIZE);
    const page = Math.max(1, opts.page ?? 1);
    const filter: Record<string, unknown> = { userId };
    if (opts.category) filter.type = opts.category;

    const [data, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, hasMore: page * limit < total };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({ userId, read: false });
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.notificationModel.updateOne({ _id: notificationId, userId }, { read: true });
    return { message: 'Marked as read' };
  }

  async markAllAsRead(userId: string) {
    await this.notificationModel.updateMany({ userId, read: false }, { read: true });
    return { message: 'All marked as read' };
  }

  // ── Preferences ──────────────────────────────────────────────────────────
  // User.notificationPreferences has always existed (with defaults) but had
  // no endpoint to read or change it — these two methods are the first thing
  // that actually exposes it.

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await this.userModel.findById(userId).select('notificationPreferences').lean();
    if (!user) throw new NotFoundException('User not found');
    return user.notificationPreferences as NotificationPreferences;
  }

  /**
   * Whitelisted update — only the four known preference keys can be set,
   * each coerced to a boolean. Mirrors the discipline applied to
   * settings.service.ts's updateRole/updateWarehouse fixes: never spread an
   * untyped request body into a document update.
   */
  async updatePreferences(
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<NotificationPreferences> {
    const set: Record<string, boolean> = {};
    for (const key of PREFERENCE_KEYS) {
      if (patch[key] !== undefined) set[`notificationPreferences.${key}`] = Boolean(patch[key]);
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: set }, { new: true })
      .select('notificationPreferences');
    if (!user) throw new NotFoundException('User not found');
    return user.notificationPreferences as NotificationPreferences;
  }

  // Internal method for creating notifications from events
  async create(data: {
    userId: string | Types.ObjectId;
    tenantId: string | Types.ObjectId;
    title: string;
    message?: string;
    description?: string;
    type?: string;
    link?: string;
  }) {
    return this.notificationModel.create({
      userId: new Types.ObjectId(data.userId as string),
      tenantId: new Types.ObjectId(data.tenantId as string),
      title: data.title,
      message: data.message || '',
      description: data.description || '',
      type: data.type || 'info',
      link: data.link || '',
    });
  }

  // Bulk notify all users of a tenant (for system-wide alerts)
  async notifyTenant(
    tenantId: string,
    userIds: string[],
    data: {
      title: string;
      message?: string;
      type?: string;
      link?: string;
    },
  ) {
    const docs = userIds.map((uid) => ({
      userId: new Types.ObjectId(uid),
      tenantId: new Types.ObjectId(tenantId),
      title: data.title,
      message: data.message || '',
      description: '',
      type: data.type || 'info',
      link: data.link || '',
      read: false,
    }));
    if (docs.length) await this.notificationModel.insertMany(docs);
  }

  async notifyTenantByAudience(
    tenantId: string,
    data: {
      title: string;
      message?: string;
      type?: string;
      link?: string;
      permissions?: string[];
      roles?: string[];
    },
  ) {
    const filters: Record<string, unknown>[] = [];
    if (data.permissions?.length) filters.push({ permissions: { $in: data.permissions } });
    if (data.roles?.length) filters.push({ role: { $in: data.roles } });
    const users = await this.userModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        isActive: true,
        ...(filters.length ? { $or: filters } : {}),
      })
      .select('_id notificationPreferences')
      .lean();

    const docs = users
      .filter((user: any) => {
        const prefs = user.notificationPreferences || {};
        if (data.type === 'inventory') return prefs.inventoryAlerts !== false;
        if (data.type === 'order') return prefs.salesAlerts !== false;
        return prefs.systemUpdates !== false;
      })
      .map((user: any) => ({
        userId: user._id,
        tenantId: new Types.ObjectId(tenantId),
        title: data.title,
        message: data.message || '',
        description: '',
        type: data.type || 'info',
        link: data.link || '',
        read: false,
      }));
    if (docs.length) await this.notificationModel.insertMany(docs);
    return { notified: docs.length };
  }

  // Event-driven notification creators
  async notifyLowStock(tenantId: string, userId: string, productName: string, currentQty: number) {
    return this.create({
      userId,
      tenantId,
      title: 'Low Stock Alert',
      message: `${productName} is running low (${currentQty} remaining)`,
      type: 'inventory',
      link: '/inventory/reorder-alerts',
    });
  }

  async notifyNewOrder(tenantId: string, userId: string, orderNumber: string, total: number) {
    return this.create({
      userId,
      tenantId,
      title: 'New Sale Completed',
      message: `Order ${orderNumber} — $${total.toFixed(2)}`,
      type: 'order',
      link: '/sales',
    });
  }

  async notifyPaymentDue(tenantId: string, userId: string, invoiceNumber: string, dueDate: string) {
    return this.create({
      userId,
      tenantId,
      title: 'Payment Reminder',
      message: `Invoice ${invoiceNumber} is due on ${dueDate}`,
      type: 'warning',
      link: '/billing',
    });
  }

  async notifySubscriptionExpiring(tenantId: string, userId: string, daysLeft: number) {
    return this.create({
      userId,
      tenantId,
      title: 'Subscription Expiring',
      message: `Your subscription will expire in ${daysLeft} day(s). Renew now to avoid interruption.`,
      type: 'alert',
      link: '/billing',
    });
  }

  async notifyOnboardingNudge(tenantId: string, userId: string, missingSteps: string[]) {
    return this.create({
      userId,
      tenantId,
      title: 'Finish your setup',
      message: `Complete your ${missingSteps.join(' and ')} configuration to start selling.`,
      type: 'info',
      link: '/onboarding',
    });
  }

  async notifyPlanLimitWarning(
    tenantId: string,
    userId: string,
    resource: 'users' | 'stores',
    used: number,
    limit: number,
  ) {
    const label = resource === 'users' ? 'team members' : 'stores';
    return this.create({
      userId,
      tenantId,
      title: 'Plan limit warning',
      message: `You are using ${used} of ${limit} ${label}. Consider upgrading your plan.`,
      type: 'warning',
      link: '/billing',
    });
  }

  async notifyMaintenance(
    tenantId: string,
    userId: string,
    data: { title: string; message: string; link?: string },
  ) {
    return this.create({
      userId,
      tenantId,
      title: data.title,
      message: data.message,
      type: 'alert',
      link: data.link || '/dashboard',
    });
  }

  async notifyTransferEvent(
    tenantId: string,
    data: {
      transferNumber: string;
      status: 'created' | 'shipped' | 'received' | 'failed';
      fromWarehouse?: string;
      toWarehouse?: string;
    },
  ) {
    const statusText = {
      created: 'created',
      shipped: 'shipped from source warehouse',
      received: 'received into destination warehouse',
      failed: 'failed',
    }[data.status];
    return this.notifyTenantByAudience(tenantId, {
      title: `Transfer ${data.status}`,
      message: `Transfer ${data.transferNumber} ${statusText}${data.fromWarehouse || data.toWarehouse ? ` (${data.fromWarehouse || 'source'} -> ${data.toWarehouse || 'destination'})` : ''}.`,
      type: data.status === 'failed' ? 'warning' : 'inventory',
      link: '/inventory/transfers',
      permissions: ['inventory.manage', 'inventory.view'],
      roles: ['owner', 'admin', 'manager'],
    });
  }

  async notifyImportEvent(
    tenantId: string,
    data: {
      entityType: string;
      status: 'completed' | 'failed';
      created?: number;
      updated?: number;
      failed?: number;
    },
  ) {
    return this.notifyTenantByAudience(tenantId, {
      title: data.status === 'completed' ? 'Import completed' : 'Import failed',
      message: `${data.entityType} import ${data.status}. Created ${data.created || 0}, updated ${data.updated || 0}, failed ${data.failed || 0}.`,
      type: data.status === 'completed' ? 'migration' : 'warning',
      link: '/settings?tab=migration',
      permissions: ['settings.manage'],
      roles: ['owner', 'admin'],
    });
  }

  async notifyReportExportEvent(
    tenantId: string,
    data: { report: string; format: string; status: 'completed' | 'failed' },
  ) {
    return this.notifyTenantByAudience(tenantId, {
      title: data.status === 'completed' ? 'Report export ready' : 'Report export failed',
      message: `${data.report} export (${data.format.toUpperCase()}) ${data.status}.`,
      type: data.status === 'completed' ? 'report' : 'warning',
      link: '/reports',
      permissions: ['reports.view'],
      roles: ['owner', 'admin', 'manager'],
    });
  }
}
