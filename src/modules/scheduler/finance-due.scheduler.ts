import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from '../../database/schemas/supplier-invoice.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationRunnerService } from './automation-runner.service';
import { isAutomationEnabled } from './automation.util';

@Injectable()
export class FinanceDueScheduler {
  constructor(
    @InjectModel(SaleOrder.name) private saleOrderModel: Model<SaleOrderDocument>,
    @InjectModel(SupplierInvoice.name) private supplierInvoiceModel: Model<SupplierInvoiceDocument>,
    private notificationsService: NotificationsService,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 8 * * *', { name: 'customer-payment-due', timeZone: 'UTC' })
  async notifyCustomerPaymentDue(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('customer-payment-due', async () => {
      const cutoff = this.tomorrowEnd();
      const rows = await this.saleOrderModel.aggregate([
        {
          $match: {
            paymentStatus: { $in: ['partial', 'unpaid'] },
            paymentDueDate: { $ne: null, $lte: cutoff },
            type: 'sale',
          },
        },
        {
          $group: {
            _id: '$tenantId',
            count: { $sum: 1 },
            amount: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          },
        },
      ]);
      let notified = 0;
      for (const row of rows) {
        const result = await this.notificationsService.notifyTenantByAudience(String(row._id), {
          title: 'Customer payments due',
          message: `${row.count} customer invoice(s) are due or overdue.`,
          type: 'finance',
          link: '/sales',
          permissions: ['sales.view', 'finance.view'],
          roles: ['owner', 'admin', 'manager'],
        });
        notified += result.notified;
      }
      return {
        summary: `Payment due alerts for ${rows.length} tenant(s)`,
        processed: rows.length,
        notified,
      };
    });
  }

  @Cron('30 8 * * *', { name: 'supplier-payable-due', timeZone: 'UTC' })
  async notifySupplierPayableDue(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('supplier-payable-due', async () => {
      const cutoff = this.tomorrowEnd();
      const rows = await this.supplierInvoiceModel.aggregate([
        {
          $match: {
            paymentStatus: { $in: ['partial', 'unpaid'] },
            dueDate: { $ne: null, $lte: cutoff },
          },
        },
        {
          $group: {
            _id: '$tenantId',
            count: { $sum: 1 },
            amount: { $sum: { $ifNull: ['$baseBalanceDue', '$balanceDue'] } },
          },
        },
      ]);
      let notified = 0;
      for (const row of rows) {
        const result = await this.notificationsService.notifyTenantByAudience(String(row._id), {
          title: 'Supplier payables due',
          message: `${row.count} supplier invoice(s) are due or overdue.`,
          type: 'finance',
          link: '/purchases',
          permissions: ['purchases.view', 'finance.view'],
          roles: ['owner', 'admin', 'manager'],
        });
        notified += result.notified;
      }
      return {
        summary: `Supplier payable alerts for ${rows.length} tenant(s)`,
        processed: rows.length,
        notified,
      };
    });
  }

  private tomorrowEnd() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
