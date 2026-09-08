import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Stock, StockDocument } from '../../database/schemas/stock.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { EmailService } from '../../common/services/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationRunnerService } from './automation-runner.service';
import { isAutomationEnabled } from './automation.util';

@Injectable()
export class InventoryAlertsScheduler {
  private readonly logger = new Logger(InventoryAlertsScheduler.name);

  constructor(
    @InjectModel(Stock.name) private stockModel: Model<StockDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 8 * * *', { name: 'low-stock-digest', timeZone: 'UTC' })
  async sendLowStockDigest(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('low-stock-digest', () => this.runLowStockDigest());
  }

  private async runLowStockDigest(): Promise<{
    summary: string;
    processed: number;
    notified: number;
    skipped: number;
  }> {
    const tenants = await this.tenantModel
      .find({ isActive: true })
      .select('_id name featureAccess')
      .lean<{ _id: Types.ObjectId; name: string; featureAccess?: string[] }[]>();

    let processed = 0;
    let notified = 0;
    let skipped = 0;

    for (const tenant of tenants) {
      const features = tenant.featureAccess ?? [];
      if (features.length && !features.includes('inventory')) {
        skipped++;
        continue;
      }

      const tenantId = String(tenant._id);
      const lowStock = await this.stockModel
        .find({
          tenantId: tenant._id,
          $expr: { $lte: ['$quantity', '$reorderPoint'] },
          reorderPoint: { $gt: 0 },
        })
        .select('productId quantity reorderPoint')
        .limit(50)
        .lean();

      if (!lowStock.length) {
        skipped++;
        continue;
      }

      const productIds = lowStock.map((s) => s.productId);
      const products = await this.productModel
        .find({ _id: { $in: productIds }, deletedAt: null })
        .select('name')
        .lean<{ _id: Types.ObjectId; name: string }[]>();
      const nameById = new Map(products.map((p) => [String(p._id), p.name]));

      const items = lowStock
        .map((s) => ({
          name: nameById.get(String(s.productId)) || 'Unknown product',
          quantity: s.quantity,
        }))
        .filter((i) => i.name !== 'Unknown product');

      if (!items.length) {
        skipped++;
        continue;
      }

      const recipients = await this.userModel
        .find({
          tenantId: tenant._id,
          isActive: true,
          role: { $in: ['owner', 'admin'] },
        })
        .select('_id email fullName')
        .lean<{ _id: Types.ObjectId; email: string; fullName: string }[]>();

      if (!recipients.length) {
        skipped++;
        continue;
      }

      const emails = [...new Set(recipients.map((r) => r.email).filter(Boolean))];
      for (const email of emails) {
        await this.emailService
          .sendLowStockAlert(email, items.slice(0, 20))
          .catch((err) =>
            this.logger.error(`Low stock email failed for ${email}: ${err?.message ?? err}`),
          );
      }

      for (const user of recipients) {
        const top = items[0];
        await this.notificationsService
          .notifyLowStock(tenantId, String(user._id), top.name, top.quantity)
          .catch(() => {});
        notified++;
      }

      processed++;
    }

    return {
      summary: `Low stock digest for ${processed} tenant(s)`,
      processed,
      notified,
      skipped,
    };
  }
}
