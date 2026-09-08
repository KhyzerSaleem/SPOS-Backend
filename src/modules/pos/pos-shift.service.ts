import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PosShift, PosShiftDocument } from '../../database/schemas/pos-shift.schema';
import { OpenShiftDto, CloseShiftDto } from './dto/shift.dto';
import { roundMoney } from '../../common/utils/money.util';

@Injectable()
export class PosShiftService {
  constructor(@InjectModel(PosShift.name) private shiftModel: Model<PosShiftDocument>) {}

  async openShift(tenantId: string, storeId: string, cashierId: string, dto: OpenShiftDto) {
    const terminalId = dto.terminalId || 'default';
    const tid = new Types.ObjectId(tenantId);
    const sid = new Types.ObjectId(storeId);
    const cid = new Types.ObjectId(cashierId);

    const existing = await this.shiftModel.findOne({
      tenantId: tid,
      storeId: sid,
      cashierId: cid,
      terminalId,
      status: 'open',
    });

    if (existing) {
      throw new ConflictException('An open shift already exists for this cashier and terminal');
    }

    const shift = await this.shiftModel.create({
      tenantId: tid,
      storeId: sid,
      terminalId,
      cashierId: cid,
      openedAt: new Date(),
      openingFloat: roundMoney(dto.openingFloat),
      status: 'open',
      totals: { salesCount: 0, grossSales: 0, refunds: 0, byTender: {} },
    });

    return this.mapShift(shift);
  }

  async getCurrentShift(
    tenantId: string,
    storeId: string,
    cashierId: string,
    terminalId = 'default',
  ) {
    const shift = await this.shiftModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        cashierId: new Types.ObjectId(cashierId),
        terminalId,
        status: 'open',
      })
      .lean();

    return shift ? this.mapShift(shift) : null;
  }

  async requireOpenShift(
    tenantId: string,
    storeId: string,
    cashierId: string,
    terminalId = 'default',
  ) {
    const shift = await this.getCurrentShift(tenantId, storeId, cashierId, terminalId);
    if (!shift) {
      throw new BadRequestException('No open shift. Open a shift before processing sales.');
    }
    return shift;
  }

  async listShifts(tenantId: string, storeId: string, query: Record<string, string>) {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };

    if (query.cashierId) filter.cashierId = new Types.ObjectId(query.cashierId);
    if (query.terminalId) filter.terminalId = query.terminalId;
    if (query.status) filter.status = query.status;
    if (query.dateFrom || query.dateTo) {
      filter.openedAt = {};
      if (query.dateFrom) (filter.openedAt as any).$gte = new Date(query.dateFrom);
      if (query.dateTo) (filter.openedAt as any).$lte = new Date(query.dateTo + 'T23:59:59.999Z');
    }

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, parseInt(query.limit || '20', 10));

    const [data, total] = await Promise.all([
      this.shiftModel
        .find(filter)
        .sort({ openedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('cashierId', 'name email')
        .lean(),
      this.shiftModel.countDocuments(filter),
    ]);

    return {
      data: data.map((s) => this.mapShift(s)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async closeShift(tenantId: string, storeId: string, shiftId: string, dto: CloseShiftDto) {
    const shift = await this.shiftModel.findOne({
      _id: new Types.ObjectId(shiftId),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      status: 'open',
    });

    if (!shift) throw new NotFoundException('Open shift not found');

    const cashTender = shift.totals?.byTender?.cash || 0;
    const expectedCash = roundMoney(
      (shift.openingFloat || 0) + cashTender - (shift.totals?.refunds || 0),
    );
    const countedCash = roundMoney(dto.countedCash);
    const variance = roundMoney(countedCash - expectedCash);

    shift.closedAt = new Date();
    shift.closingFloat = dto.closingFloat != null ? roundMoney(dto.closingFloat) : null;
    shift.countedCash = countedCash;
    shift.expectedCash = expectedCash;
    shift.variance = variance;
    shift.status = 'closed';
    await shift.save();

    return this.mapShift(shift.toObject());
  }

  async recordSaleOnShift(
    shiftId: string,
    total: number,
    payments: { method: string; amount: number }[],
    session?: import('mongoose').ClientSession | null,
  ) {
    const inc: Record<string, number> = {
      'totals.salesCount': 1,
      'totals.grossSales': roundMoney(total),
    };

    const byTender: Record<string, number> = {};
    for (const p of payments) {
      byTender[p.method] = (byTender[p.method] || 0) + roundMoney(p.amount);
    }

    const update: Record<string, unknown> = { $inc: inc };
    for (const [method, amount] of Object.entries(byTender)) {
      update.$inc = {
        ...(update.$inc as Record<string, number>),
        [`totals.byTender.${method}`]: amount,
      };
    }

    await this.shiftModel.updateOne(
      { _id: new Types.ObjectId(shiftId), status: 'open' },
      update,
      session ? { session } : {},
    );
  }

  async recordRefundOnShift(
    shiftId: string,
    refundAmount: number,
    session?: import('mongoose').ClientSession | null,
  ) {
    await this.shiftModel.updateOne(
      { _id: new Types.ObjectId(shiftId), status: 'open' },
      {
        $inc: {
          'totals.refunds': roundMoney(refundAmount),
          'totals.byTender.cash': -roundMoney(refundAmount),
        },
      },
      session ? { session } : {},
    );
  }

  async getZReport(tenantId: string, storeId: string, shiftId: string) {
    const shift = await this.shiftModel
      .findOne({
        _id: new Types.ObjectId(shiftId),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
      })
      .populate('cashierId', 'name email')
      .lean();

    if (!shift) throw new NotFoundException('Shift not found');

    const report = {
      shift: this.mapShift(shift),
      cashier: shift.cashierId
        ? {
            name: (shift.cashierId as any).name,
            email: (shift.cashierId as any).email,
          }
        : null,
      summary: {
        openingFloat: shift.openingFloat,
        grossSales: shift.totals?.grossSales || 0,
        refunds: shift.totals?.refunds || 0,
        netSales: roundMoney((shift.totals?.grossSales || 0) - (shift.totals?.refunds || 0)),
        salesCount: shift.totals?.salesCount || 0,
        byTender: shift.totals?.byTender || {},
        expectedCash:
          shift.expectedCash ??
          roundMoney(
            (shift.openingFloat || 0) +
              (shift.totals?.byTender?.cash || 0) -
              (shift.totals?.refunds || 0),
          ),
        countedCash: shift.countedCash,
        variance: shift.variance,
        closingFloat: shift.closingFloat,
      },
      generatedAt: new Date().toISOString(),
    };

    const html = this.buildZReportHtml(report);
    return { ...report, html };
  }

  private buildZReportHtml(report: any): string {
    const s = report.summary;
    const tenderRows = Object.entries(s.byTender || {})
      .map(
        ([method, amount]) =>
          `<tr><td>${method}</td><td style="text-align:right">${Number(amount).toFixed(2)}</td></tr>`,
      )
      .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Z-Report</title>
<style>body{font-family:monospace;max-width:320px;margin:0 auto;padding:16px;font-size:12px}
h1{text-align:center;font-size:16px}table{width:100%;border-collapse:collapse}td{padding:4px 0}
.total{font-weight:bold;border-top:1px solid #000}</style></head><body>
<h1>Z-REPORT</h1>
<p>Shift: ${report.shift._id}<br>
Cashier: ${report.cashier?.name || '—'}<br>
Opened: ${new Date(report.shift.openedAt).toLocaleString()}<br>
Closed: ${report.shift.closedAt ? new Date(report.shift.closedAt).toLocaleString() : '—'}</p>
<table>
<tr><td>Opening float</td><td style="text-align:right">${s.openingFloat.toFixed(2)}</td></tr>
<tr><td>Sales count</td><td style="text-align:right">${s.salesCount}</td></tr>
<tr><td>Gross sales</td><td style="text-align:right">${s.grossSales.toFixed(2)}</td></tr>
<tr><td>Refunds</td><td style="text-align:right">${s.refunds.toFixed(2)}</td></tr>
<tr class="total"><td>Net sales</td><td style="text-align:right">${s.netSales.toFixed(2)}</td></tr>
</table>
<h2>By tender</h2>
<table>${tenderRows || '<tr><td colspan="2">No payments</td></tr>'}</table>
<h2>Cash reconciliation</h2>
<table>
<tr><td>Expected cash</td><td style="text-align:right">${s.expectedCash.toFixed(2)}</td></tr>
<tr><td>Counted cash</td><td style="text-align:right">${(s.countedCash ?? 0).toFixed(2)}</td></tr>
<tr class="total"><td>Variance</td><td style="text-align:right">${(s.variance ?? 0).toFixed(2)}</td></tr>
</table>
<p style="text-align:center;margin-top:24px">Generated ${new Date(report.generatedAt).toLocaleString()}</p>
</body></html>`;
  }

  private mapShift(shift: any) {
    return {
      _id: shift._id.toString(),
      tenantId: shift.tenantId?.toString?.() || shift.tenantId,
      storeId: shift.storeId?.toString?.() || shift.storeId,
      terminalId: shift.terminalId,
      cashierId:
        shift.cashierId?.toString?.() || shift.cashierId?._id?.toString?.() || shift.cashierId,
      cashier: shift.cashierId?.name
        ? { name: shift.cashierId.name, email: shift.cashierId.email }
        : undefined,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openingFloat: shift.openingFloat,
      closingFloat: shift.closingFloat,
      expectedCash: shift.expectedCash,
      countedCash: shift.countedCash,
      variance: shift.variance,
      status: shift.status,
      totals: shift.totals || { salesCount: 0, grossSales: 0, refunds: 0, byTender: {} },
    };
  }
}
