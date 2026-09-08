import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { EmailService } from '../../common/services/email.service';
import { AutomationRunnerService } from './automation-runner.service';
import { isAutomationEnabled } from './automation.util';

@Injectable()
export class SalesSummaryScheduler {
  private readonly logger = new Logger(SalesSummaryScheduler.name);

  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(SaleOrder.name) private saleModel: Model<SaleOrderDocument>,
    private emailService: EmailService,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 7 * * 1', { name: 'weekly-sales-summary', timeZone: 'UTC' })
  async sendWeeklySummaries(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('weekly-sales-summary', () => this.runWeeklySummaries());
  }

  private async runWeeklySummaries(): Promise<{
    summary: string;
    processed: number;
    notified: number;
    skipped: number;
  }> {
    const periodEnd = new Date();
    periodEnd.setUTCHours(0, 0, 0, 0);
    const periodStart = new Date(periodEnd.getTime() - 7 * 86_400_000);

    const tenants = await this.tenantModel
      .find({ isActive: true })
      .select('_id name settings')
      .lean();

    let processed = 0;
    let notified = 0;
    let skipped = 0;

    for (const tenant of tenants) {
      const store = await this.storeModel
        .findOne({ tenantId: tenant._id, isActive: true })
        .sort({ createdAt: 1 })
        .lean();
      if (!store) {
        skipped++;
        continue;
      }

      const match = {
        tenantId: tenant._id,
        storeId: store._id,
        type: 'sale',
        status: { $ne: 'cancelled' },
        createdAt: { $gte: periodStart, $lt: periodEnd },
      };

      const [agg, topProducts] = await Promise.all([
        this.saleModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              totalSales: { $sum: '$totalAmount' },
              ordersCount: { $sum: 1 },
            },
          },
        ]),
        this.saleModel.aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productName',
              qty: { $sum: '$items.quantity' },
              revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
        ]),
      ]);

      const stats = agg[0] || { totalSales: 0, ordersCount: 0 };
      if (stats.ordersCount === 0) {
        skipped++;
        continue;
      }

      const owners = await this.userModel
        .find({ tenantId: tenant._id, role: 'owner', isActive: true, email: { $ne: '' } })
        .select('email')
        .lean<{ email: string }[]>();

      if (!owners.length) {
        skipped++;
        continue;
      }

      const currency = (tenant.settings as { currency?: string } | undefined)?.currency || 'USD';
      const periodLabel = `${periodStart.toLocaleDateString('en-US')} – ${periodEnd.toLocaleDateString('en-US')}`;

      for (const owner of owners) {
        await this.emailService
          .sendSalesReport(owner.email, {
            storeName: store.name,
            periodLabel,
            totalSales: stats.totalSales,
            totalOrders: stats.ordersCount,
            currency,
            topProducts: topProducts.map((p: { _id: string; qty: number; revenue: number }) => ({
              name: p._id || 'Product',
              qty: p.qty,
              revenue: p.revenue,
            })),
          })
          .catch((err) =>
            this.logger.error(`Weekly summary failed for ${owner.email}: ${err?.message ?? err}`),
          );
        notified++;
      }

      processed++;
    }

    return {
      summary: `Weekly summaries sent for ${processed} tenant(s)`,
      processed,
      notified,
      skipped,
    };
  }
}
