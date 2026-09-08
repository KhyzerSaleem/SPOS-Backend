import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PipelineStage } from 'mongoose';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  Document as DocxDocument,
  Footer,
  Header,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { SaleOrder, SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { PurchaseOrder, PurchaseOrderDocument } from '../../database/schemas/purchase-order.schema';
import { Expense, ExpenseDocument } from '../../database/schemas/expense.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Customer, CustomerDocument } from '../../database/schemas/customer.schema';
import { Supplier, SupplierDocument } from '../../database/schemas/supplier.schema';
import { Stock, StockDocument } from '../../database/schemas/stock.schema';
import { StockMovement, StockMovementDocument } from '../../database/schemas/stock-movement.schema';
import { Transfer, TransferDocument } from '../../database/schemas/transfer.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from '../../database/schemas/supplier-invoice.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../../database/schemas/product-variant.schema';
import {
  GoodsReceivedNote,
  GoodsReceivedNoteDocument,
} from '../../database/schemas/goods-received-note.schema';
import { PosShift, PosShiftDocument } from '../../database/schemas/pos-shift.schema';
import { EmailService } from '../../common/services/email.service';
import { CurrencyService } from '../../common/services/currency.service';
import { NotificationsService } from '../notifications/notifications.service';

type ReportExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf' | 'docx';

type ReportCellValue =
  string | number | boolean | Date | null | undefined | Record<string, unknown> | unknown[];

interface ReportBrand {
  appName: string;
  businessName: string;
  storeName: string;
  addressLines: string[];
  contactLines: string[];
  logo?: string;
  currency: string;
  timezone: string;
}

interface ReportColumn {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'right';
}

interface ReportDocumentModel {
  reportKey: string;
  title: string;
  brand: ReportBrand;
  period: string;
  generatedAt: Date;
  generatedAtLabel: string;
  filters: Record<string, string>;
  columns: ReportColumn[];
  rows: Record<string, ReportCellValue>[];
  formattedRows: Record<string, string>[];
  summary: Record<string, unknown>;
  totals: Record<string, unknown> | null;
  formattedTotals: Record<string, string> | null;
  watermark: string;
  footerText: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(SaleOrder.name) private saleModel: Model<SaleOrderDocument>,
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Stock.name) private stockModel: Model<StockDocument>,
    @InjectModel(StockMovement.name) private movementModel: Model<StockMovementDocument>,
    @InjectModel(Transfer.name) private transferModel: Model<TransferDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(SupplierInvoice.name) private supplierInvoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(ProductVariant.name) private variantModel: Model<ProductVariantDocument>,
    @InjectModel(GoodsReceivedNote.name) private grnModel: Model<GoodsReceivedNoteDocument>,
    @InjectModel(PosShift.name) private posShiftModel: Model<PosShiftDocument>,
    private emailService: EmailService,
    private currencyService: CurrencyService,
    private notificationsService: NotificationsService,
  ) {}

  async emailSalesReport(
    toEmail: string,
    tenantId: string,
    storeId: string,
    query: Record<string, string>,
  ): Promise<{ message: string }> {
    const report = await this.salesReport(tenantId, storeId, query);
    const store = await this.storeModel.findById(storeId).lean();
    const from = query.dateFrom ? new Date(query.dateFrom).toLocaleDateString() : 'start';
    const to = query.dateTo ? new Date(query.dateTo).toLocaleDateString() : 'today';

    await this.emailService.sendSalesReport(toEmail, {
      storeName: store?.name || 'Store',
      periodLabel: `${from} – ${to}`,
      totalSales: report.summary.totalSales,
      totalOrders: report.summary.ordersCount,
      topProducts: report.data.slice(0, 5).map((r: { orderNo?: string; total?: number }) => ({
        name: r.orderNo || 'Sale',
        qty: 1,
        revenue: r.total ?? 0,
      })),
    });

    return { message: `Sales report emailed to ${toEmail}` };
  }

  private base(tenantId: string, storeId: string) {
    return { tenantId: new Types.ObjectId(tenantId), storeId: new Types.ObjectId(storeId) };
  }

  private dateRange(from?: string, to?: string) {
    const f: any = {};
    if (from) f.$gte = new Date(from);
    if (to) f.$lte = new Date(to + 'T23:59:59.999Z');
    return Object.keys(f).length ? f : undefined;
  }

  async exportReport(tenantId: string, storeId: string, report: string, q: Record<string, string>) {
    const format = this.normalizeExportFormat(q.format);
    const payload: any = await this.runReportByKey(tenantId, storeId, report, q);
    const reportDocument = await this.buildReportDocument(tenantId, storeId, report, q, payload);

    let result: { buffer: Buffer; contentType: string; fileName: string };
    if (format === 'json') {
      result = {
        buffer: Buffer.from(
          JSON.stringify(
            {
              title: reportDocument.title,
              businessName: reportDocument.brand.businessName,
              storeName: reportDocument.brand.storeName,
              period: reportDocument.period,
              generatedAt: reportDocument.generatedAt.toISOString(),
              filters: reportDocument.filters,
              columns: reportDocument.columns.map(({ key, label }) => ({ key, label })),
              summary: reportDocument.summary,
              totals: reportDocument.totals,
              data: reportDocument.rows,
            },
            null,
            2,
          ),
        ),
        contentType: 'application/json',
        fileName: this.exportFileName(reportDocument, format),
      };
    } else if (format === 'csv') {
      result = {
        buffer: Buffer.from(this.toCsv(reportDocument)),
        contentType: 'text/csv; charset=utf-8',
        fileName: this.exportFileName(reportDocument, format),
      };
    } else if (format === 'xlsx') {
      result = {
        buffer: await this.toExcel(reportDocument),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: this.exportFileName(reportDocument, format),
      };
    } else if (format === 'docx') {
      result = {
        buffer: await this.toDocx(reportDocument),
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileName: this.exportFileName(reportDocument, format),
      };
    } else {
      result = {
        buffer: await this.toPdf(reportDocument),
        contentType: 'application/pdf',
        fileName: this.exportFileName(reportDocument, format),
      };
    }
    await this.safeNotifyReportExport(tenantId, report, format, 'completed');
    return result;
  }

  private async safeNotifyReportExport(
    tenantId: string,
    report: string,
    format: ReportExportFormat,
    status: 'completed' | 'failed',
  ) {
    try {
      await this.notificationsService.notifyReportExportEvent(tenantId, { report, format, status });
    } catch {
      // Report downloads should not depend on notification delivery.
    }
  }

  private async runReportByKey(
    tenantId: string,
    storeId: string,
    report: string,
    q: Record<string, string>,
  ) {
    switch (report) {
      case 'sales':
        return this.salesReport(tenantId, storeId, q);
      case 'daily-summary':
        return this.dailySummary(tenantId, storeId, q);
      case 'purchases':
        return this.purchaseReport(tenantId, storeId, q);
      case 'expenses':
        return this.expenseReport(tenantId, storeId, q);
      case 'inventory':
        return this.inventoryReport(tenantId, storeId);
      case 'inventory-valuation':
        return this.inventoryValuation(tenantId, storeId);
      case 'dead-stock':
        return this.deadStockReport(tenantId, storeId, q);
      case 'stock-movement':
        return this.stockMovement(tenantId, storeId, q);
      case 'customers':
        return this.customerReport(tenantId, storeId, q);
      case 'suppliers':
        return this.supplierReport(tenantId, storeId, q);
      case 'vat-tax':
        return this.vatTaxReport(tenantId, storeId, q);
      case 'profit-loss':
        return this.profitLoss(tenantId, storeId, q);
      case 'transfers':
        return this.transferReport(tenantId, storeId, q);
      case 'staff-performance':
        return this.staffPerformance(tenantId, storeId, q);
      case 'shifts':
        return this.shiftReport(tenantId, storeId, q);
      case 'variants-sell-through':
        return this.variantSellThrough(tenantId, storeId, q);
      default:
        throw new BadRequestException(`Unsupported report export: ${report}`);
    }
  }

  private rowsForExport(payload: any): Record<string, unknown>[] {
    if (Array.isArray(payload?.data)) return payload.data;
    if (payload?.summary && !payload?.data) {
      return Object.entries(payload.summary).map(([metric, value]) => ({ metric, value }));
    }
    return [];
  }

  private normalizeExportFormat(format?: string): ReportExportFormat {
    const f = String(format || 'pdf').toLowerCase();
    return ['csv', 'json', 'xlsx', 'pdf', 'docx'].includes(f) ? (f as ReportExportFormat) : 'pdf';
  }

  private async buildReportDocument(
    tenantId: string,
    storeId: string,
    report: string,
    q: Record<string, string>,
    payload: any,
  ): Promise<ReportDocumentModel> {
    const brand = await this.resolveReportBrand(tenantId, storeId);
    const rows = this.rowsForExport(payload) as Record<string, ReportCellValue>[];
    const totals = this.normalizeObject(payload?.totals);
    const summary = this.normalizeObject(payload?.summary) || {};
    const columns = this.columnsForExport(rows, totals);
    const generatedAt = new Date();
    const generatedAtLabel = this.formatDateTime(generatedAt, brand);
    const filters = this.exportFilters(q);
    const title = this.reportTitle(report);

    return {
      reportKey: report,
      title,
      brand,
      period: this.periodLabel(q),
      generatedAt,
      generatedAtLabel,
      filters,
      columns,
      rows,
      formattedRows: rows.map((row) => this.formatRow(row, columns, brand)),
      summary,
      totals,
      formattedTotals: totals ? this.formatRow(totals, columns, brand) : null,
      watermark: `${brand.businessName} - Confidential`,
      footerText: `Generated by ${brand.appName} reporting engine for ${brand.businessName}. Figures are based on the selected filters and system records at generation time.`,
    };
  }

  private async resolveReportBrand(tenantId: string, storeId: string): Promise<ReportBrand> {
    const [tenant, store] = await Promise.all([
      this.tenantModel.findById(tenantId).lean(),
      this.storeModel.findById(storeId).lean(),
    ]);
    const settings = ((tenant as any)?.settings || {}) as Record<string, string>;
    const businessName = (tenant as any)?.name || settings.systemName || store?.name || 'SwiftPOS';
    const appName = settings.systemName || 'SwiftPOS';
    const addressLines = [
      settings.address,
      [settings.city, settings.country].filter(Boolean).join(', '),
      store?.address ? `Store: ${store.address}` : '',
    ].filter(Boolean);
    const contactLines = [
      settings.phone ? `Phone: ${settings.phone}` : '',
      settings.email ? `Email: ${settings.email}` : '',
      `Currency: ${store?.currency || (tenant as any)?.baseCurrency || settings.currency || 'USD'}`,
    ].filter(Boolean);

    return {
      appName,
      businessName,
      storeName: store?.name || 'All Stores',
      addressLines,
      contactLines,
      logo: settings.logo,
      currency: store?.currency || (tenant as any)?.baseCurrency || settings.currency || 'USD',
      timezone: settings.timezone || 'UTC',
    };
  }

  private columnsForExport(
    rows: Record<string, unknown>[],
    totals: Record<string, unknown> | null,
  ): ReportColumn[] {
    const keys = new Set<string>();
    rows.forEach((row) => Object.keys(row || {}).forEach((key) => keys.add(key)));
    if (totals) Object.keys(totals).forEach((key) => keys.add(key));
    if (!keys.size) keys.add('message');

    return Array.from(keys).map((key) => ({
      key,
      label: this.columnLabel(key),
      width: this.columnWidth(key),
      align: this.isNumericKey(key) ? 'right' : 'left',
    }));
  }

  private normalizeObject(value: unknown): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    return value as Record<string, unknown>;
  }

  private exportFilters(q: Record<string, string>) {
    return Object.fromEntries(
      Object.entries(q || {}).filter(
        ([key, value]) => key !== 'format' && value != null && String(value).trim() !== '',
      ),
    );
  }

  private reportTitle(report: string) {
    return report
      .replace(/\//g, '-')
      .split('-')
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }

  private periodLabel(q: Record<string, string>) {
    return `${q.dateFrom || 'Start'} to ${q.dateTo || 'Today'}`;
  }

  private exportFileName(reportDocument: ReportDocumentModel, format: ReportExportFormat) {
    const appSlug = this.slugify(reportDocument.brand.appName || 'swiftpos');
    const reportSlug = this.slugify(reportDocument.reportKey);
    return `${appSlug}-${reportSlug}-${reportDocument.generatedAt.toISOString().slice(0, 10)}.${format}`;
  }

  private toCsv(reportDocument: ReportDocumentModel) {
    const escape = (value: unknown) => {
      const text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const headers = reportDocument.columns.map((column) => escape(column.label)).join(',');
    const body = reportDocument.formattedRows.map((row) =>
      reportDocument.columns.map((column) => escape(row[column.key])).join(','),
    );
    if (reportDocument.formattedTotals) {
      body.push(
        reportDocument.columns
          .map((column) => escape(reportDocument.formattedTotals?.[column.key] || ''))
          .join(','),
      );
    }
    return `\uFEFF${[headers, ...body].join('\n')}`;
  }

  private async toExcel(reportDocument: ReportDocumentModel) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = reportDocument.brand.appName;
    workbook.created = reportDocument.generatedAt;
    workbook.modified = reportDocument.generatedAt;
    const sheet = workbook.addWorksheet(this.safeSheetName(reportDocument.title));

    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = reportDocument.brand.businessName;
    sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFEA580C' } };
    sheet.getCell('A2').value = reportDocument.title;
    sheet.getCell('A2').font = { bold: true, size: 14, color: { argb: 'FF1C1917' } };
    sheet.getCell('A3').value = `Store: ${reportDocument.brand.storeName}`;
    sheet.getCell('B3').value = `Period: ${reportDocument.period}`;
    sheet.getCell('C3').value = `Generated: ${reportDocument.generatedAtLabel}`;
    sheet.getCell('D3').value = `Currency: ${reportDocument.brand.currency}`;
    sheet.addRow([]);

    if (reportDocument.brand.addressLines.length || reportDocument.brand.contactLines.length) {
      sheet.addRow([
        'Business Details',
        [...reportDocument.brand.addressLines, ...reportDocument.brand.contactLines].join(' | '),
      ]);
      sheet.addRow([]);
    }

    const filterEntries = Object.entries(reportDocument.filters);
    if (filterEntries.length) {
      sheet.addRow([
        'Filters',
        filterEntries.map(([key, value]) => `${this.columnLabel(key)}: ${value}`).join(' | '),
      ]);
      sheet.addRow([]);
    }

    const headerRow = sheet.addRow(reportDocument.columns.map((column) => column.label));
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
    headerRow.alignment = { vertical: 'middle' };

    reportDocument.formattedRows.forEach((row) => {
      sheet.addRow(reportDocument.columns.map((column) => row[column.key] || ''));
    });

    if (reportDocument.formattedTotals) {
      const totalRow = sheet.addRow(
        reportDocument.columns.map((column) => reportDocument.formattedTotals?.[column.key] || ''),
      );
      totalRow.font = { bold: true };
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
    }

    sheet.addRow([]);
    sheet.addRow(['Watermark', reportDocument.watermark]);
    sheet.addRow(['Footer', reportDocument.footerText]);
    sheet.columns = reportDocument.columns.map((column) => ({
      width: Math.max(12, Math.min(28, column.width)),
      style: { alignment: { horizontal: column.align === 'right' ? 'right' : 'left' } },
    }));
    sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
    sheet.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: headerRow.number, column: reportDocument.columns.length },
    };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async toDocx(reportDocument: ReportDocumentModel) {
    const tableRows = [
      new TableRow({
        children: reportDocument.columns.map(
          (column) =>
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: column.label, bold: true })] }),
              ],
            }),
        ),
      }),
      ...reportDocument.formattedRows.slice(0, 300).map(
        (row) =>
          new TableRow({
            children: reportDocument.columns.map(
              (column) =>
                new TableCell({
                  children: [new Paragraph({ text: row[column.key] || '' })],
                }),
            ),
          }),
      ),
    ];
    if (reportDocument.formattedTotals) {
      tableRows.push(
        new TableRow({
          children: reportDocument.columns.map(
            (column) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: reportDocument.formattedTotals?.[column.key] || '',
                        bold: true,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
      );
    }

    const doc = new DocxDocument({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `${reportDocument.brand.businessName} | ${reportDocument.title}`,
                      bold: true,
                    }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: reportDocument.footerText, size: 16 })],
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: reportDocument.brand.businessName,
                  bold: true,
                  size: 34,
                  color: 'EA580C',
                }),
              ],
            }),
            new Paragraph({
              children: [new TextRun({ text: reportDocument.title, bold: true, size: 28 })],
            }),
            new Paragraph({ text: `Store: ${reportDocument.brand.storeName}` }),
            new Paragraph({ text: `Period: ${reportDocument.period}` }),
            new Paragraph({ text: `Generated: ${reportDocument.generatedAtLabel}` }),
            new Paragraph({ text: `Currency: ${reportDocument.brand.currency}` }),
            ...(reportDocument.brand.addressLines.length
              ? [new Paragraph({ text: reportDocument.brand.addressLines.join(' | ') })]
              : []),
            ...(reportDocument.brand.contactLines.length
              ? [new Paragraph({ text: reportDocument.brand.contactLines.join(' | ') })]
              : []),
            new Paragraph({ text: reportDocument.watermark }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
            }),
            ...(reportDocument.formattedRows.length > 300
              ? [
                  new Paragraph({
                    text: `Showing first 300 rows of ${reportDocument.formattedRows.length}. Export Excel for the full dataset.`,
                  }),
                ]
              : []),
          ],
        },
      ],
    });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  private async toPdf(reportDocument: ReportDocumentModel): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 32, size: 'A4', layout: 'landscape', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    this.drawPdfHeader(doc, reportDocument);
    this.drawPdfTable(doc, reportDocument);
    this.drawPdfSummary(doc, reportDocument);
    this.drawPdfFooterAndWatermark(doc, reportDocument);
    doc.end();
    return done;
  }

  private formatRow(
    row: Record<string, unknown>,
    columns: ReportColumn[],
    brand: ReportBrand,
  ): Record<string, string> {
    return Object.fromEntries(
      columns.map((column) => [
        column.key,
        this.formatValue(row?.[column.key] as ReportCellValue, column.key, brand),
      ]),
    );
  }

  private formatValue(value: ReportCellValue, key: string, brand: ReportBrand): string {
    if (value == null) return '';
    if (value instanceof Date) return this.formatDateTime(value, brand);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      if (this.isMoneyKey(key)) return this.formatMoney(value, brand.currency);
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
    }
    if (Array.isArray(value))
      return value.map((item) => this.formatValue(item as ReportCellValue, key, brand)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);

    const text = String(value);
    if (this.looksLikeDateKey(key) && this.looksLikeDateValue(text)) {
      return this.formatDateTime(new Date(text), brand);
    }
    return text;
  }

  private formatDateTime(value: Date, brand: ReportBrand): string {
    try {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: brand.timezone || 'UTC',
      }).format(value);
    } catch {
      return value.toISOString();
    }
  }

  private formatMoney(value: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${currency || 'USD'} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`;
    }
  }

  private columnLabel(key: string) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  private columnWidth(key: string) {
    if (this.looksLikeDateKey(key)) return 18;
    if (this.isMoneyKey(key)) return 16;
    if (/description|summary|product|customer|supplier|warehouse|reference|name/i.test(key))
      return 24;
    return 14;
  }

  private isNumericKey(key: string) {
    return /(amount|total|tax|discount|subtotal|price|cost|value|sales|expense|refund|purchase|revenue|profit|margin|qty|quantity|count|items|stock|balance|cash|card|paid|units|days|hours|percent|rate)$/i.test(
      key,
    );
  }

  private isMoneyKey(key: string) {
    return /(amount|total|tax|discount|subtotal|price|cost|value|sales|expense|refund|purchase|revenue|profit|balance|cash|card|paid|retail|shipping)$/i.test(
      key,
    );
  }

  private looksLikeDateKey(key: string) {
    return /(date|createdAt|updatedAt|generatedAt|time)$/i.test(key);
  }

  private looksLikeDateValue(value: string) {
    if (!value || value === 'TOTAL') return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && /\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/.test(value);
  }

  private truncate(value: string, max = 34) {
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 1))}...`;
  }

  private slugify(value: string) {
    return (
      String(value || 'report')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'report'
    );
  }

  private safeSheetName(value: string) {
    return (
      String(value || 'Report')
        .replace(/[\\/*?:[\]]/g, ' ')
        .slice(0, 31) || 'Report'
    );
  }

  private drawPdfHeader(doc: any, reportDocument: ReportDocumentModel) {
    const { brand } = reportDocument;
    doc
      .fillColor('#EA580C')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(brand.businessName, 32, 30, { width: 360 });
    doc.fillColor('#1C1917').fontSize(15).text(reportDocument.title, 32, 55, { width: 360 });
    doc.font('Helvetica').fontSize(8).fillColor('#57534E');
    const businessLines = [...brand.addressLines, ...brand.contactLines].slice(0, 4);
    businessLines.forEach((line, index) => doc.text(line, 32, 78 + index * 11, { width: 360 }));

    const metaX = doc.page.width - 310;
    const meta = [
      ['Store', brand.storeName],
      ['Period', reportDocument.period],
      ['Generated', reportDocument.generatedAtLabel],
      ['Currency', brand.currency],
    ];
    doc.roundedRect(metaX, 32, 278, 76, 8).fillAndStroke('#FFF7ED', '#FED7AA');
    meta.forEach(([label, value], index) => {
      doc
        .fillColor('#78716C')
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(label.toUpperCase(), metaX + 12, 42 + index * 16, { width: 80 });
      doc
        .fillColor('#1C1917')
        .font('Helvetica')
        .fontSize(8)
        .text(value, metaX + 92, 42 + index * 16, { width: 170 });
    });

    const filterText = Object.entries(reportDocument.filters)
      .map(([key, value]) => `${this.columnLabel(key)}: ${value}`)
      .join(' | ');
    if (filterText) {
      doc
        .fillColor('#57534E')
        .fontSize(8)
        .text(`Filters: ${filterText}`, 32, 122, { width: doc.page.width - 64 });
    }
    doc
      .moveTo(32, 142)
      .lineTo(doc.page.width - 32, 142)
      .strokeColor('#E7E5E4')
      .stroke();
    doc.y = 154;
  }

  private drawPdfTable(doc: any, reportDocument: ReportDocumentModel) {
    const columns = reportDocument.columns;
    const tableX = 32;
    const pageWidth = doc.page.width - 64;
    const totalWeight = columns.reduce((sum, column) => sum + column.width, 0) || 1;
    const widths = columns.map((column) =>
      Math.max(48, Math.floor(pageWidth * (column.width / totalWeight))),
    );
    const headerHeight = 22;
    const rowHeight = 21;
    const bottomY = doc.page.height - 76;

    const drawHeader = () => {
      const headerY = doc.y;
      doc.rect(tableX, headerY, pageWidth, headerHeight).fill('#EA580C');
      let x = tableX;
      columns.forEach((column, index) => {
        doc
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(column.label, x + 4, headerY + 7, {
            width: widths[index] - 8,
            align: column.align,
          });
        x += widths[index];
      });
      doc.y = headerY + headerHeight;
    };

    drawHeader();
    const rows = reportDocument.formattedRows.length
      ? reportDocument.formattedRows
      : [
          Object.fromEntries(
            columns.map((column) => [
              column.key,
              column.key === columns[0].key ? 'No data for selected filters' : '',
            ]),
          ),
        ];

    rows.forEach((row, rowIndex) => {
      if (doc.y + rowHeight > bottomY) {
        doc.addPage();
        this.drawPdfHeader(doc, reportDocument);
        drawHeader();
      }
      const fill = rowIndex % 2 === 0 ? '#FFFFFF' : '#FAFAF9';
      const rowY = doc.y;
      doc.rect(tableX, rowY, pageWidth, rowHeight).fill(fill);
      let x = tableX;
      columns.forEach((column, index) => {
        doc
          .fillColor('#1C1917')
          .font('Helvetica')
          .fontSize(7)
          .text(this.truncate(row[column.key] || '', 36), x + 4, rowY + 6, {
            width: widths[index] - 8,
            align: column.align,
          });
        x += widths[index];
      });
      doc.y = rowY + rowHeight;
    });

    if (reportDocument.formattedTotals) {
      if (doc.y + rowHeight > bottomY) {
        doc.addPage();
        this.drawPdfHeader(doc, reportDocument);
        drawHeader();
      }
      const totalsY = doc.y;
      doc.rect(tableX, totalsY, pageWidth, rowHeight).fill('#FFF7ED');
      let x = tableX;
      columns.forEach((column, index) => {
        doc
          .fillColor('#1C1917')
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(
            this.truncate(reportDocument.formattedTotals?.[column.key] || '', 36),
            x + 4,
            totalsY + 6,
            {
              width: widths[index] - 8,
              align: column.align,
            },
          );
        x += widths[index];
      });
      doc.y = totalsY + rowHeight;
    }
  }

  private drawPdfSummary(doc: any, reportDocument: ReportDocumentModel) {
    const summaryEntries = Object.entries(reportDocument.summary || {});
    if (!summaryEntries.length) return;
    doc.moveDown(1);
    const summaryY = doc.y;
    if (summaryY + 34 > doc.page.height - 76) return;
    doc.roundedRect(doc.page.width - 250, summaryY, 218, 32, 6).fillAndStroke('#FFF7ED', '#FED7AA');
    doc
      .fillColor('#1C1917')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Summary', doc.page.width - 238, summaryY + 7, { width: 194 });
    const formatted = summaryEntries.map(
      ([key, value]) =>
        `${this.columnLabel(key)}: ${this.formatValue(value as ReportCellValue, key, reportDocument.brand)}`,
    );
    doc
      .fillColor('#57534E')
      .font('Helvetica')
      .fontSize(7)
      .text(formatted.join('   |   '), doc.page.width - 238, summaryY + 20, {
        width: 194,
        height: 10,
      });
    doc.y = summaryY + 34;
  }

  private drawPdfFooterAndWatermark(doc: any, reportDocument: ReportDocumentModel) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.save();
      doc.rotate(-28, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc
        .opacity(0.045)
        .fillColor('#EA580C')
        .font('Helvetica-Bold')
        .fontSize(52)
        .text('CONFIDENTIAL', 120, doc.page.height / 2 - 20, {
          align: 'center',
          width: doc.page.width - 240,
        });
      doc.restore();
      doc.opacity(1);
      doc
        .moveTo(32, doc.page.height - 46)
        .lineTo(doc.page.width - 32, doc.page.height - 46)
        .strokeColor('#E7E5E4')
        .stroke();
      doc
        .fillColor('#78716C')
        .font('Helvetica')
        .fontSize(7)
        .text(reportDocument.footerText, 32, doc.page.height - 38, {
          width: doc.page.width - 150,
        });
      doc.text(
        `Page ${i + 1 - range.start} of ${range.count}`,
        doc.page.width - 112,
        doc.page.height - 38,
        {
          width: 80,
          align: 'right',
        },
      );
    }
  }

  // ── 1. Sales Report ──

  async salesReport(tenantId: string, storeId: string, q: any) {
    const match: any = {
      ...this.base(tenantId, storeId),
      type: 'sale',
      status: { $ne: 'cancelled' },
    };
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    if (dr) match.createdAt = dr;

    const [rows, agg] = await Promise.all([
      this.saleModel
        .find(match)
        .sort({ createdAt: -1 })
        .limit(500)
        .populate('customerId', 'name')
        .populate('cashierId', 'fullName')
        .lean(),
      this.saleModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalSales: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
            ordersCount: { $sum: 1 },
            totalTax: { $sum: { $ifNull: ['$baseTax', '$tax'] } },
            totalDiscount: { $sum: { $ifNull: ['$baseDiscount', '$discount'] } },
          },
        },
      ]),
    ]);

    const returns = await this.saleModel.countDocuments({
      ...this.base(tenantId, storeId),
      type: 'return',
      ...(dr ? { createdAt: dr } : {}),
    });
    const s = agg[0] || { totalSales: 0, ordersCount: 0, totalTax: 0, totalDiscount: 0 };

    return {
      summary: {
        totalSales: s.totalSales,
        ordersCount: s.ordersCount,
        avgOrderValue: s.ordersCount ? s.totalSales / s.ordersCount : 0,
        returns,
      },
      data: rows.map((r) => ({
        date: (r as any).createdAt,
        orderNo: r.orderNumber,
        customer: (r.customerId as any)?.name || '—',
        items: r.items?.length || 0,
        subtotal:
          ((r as any).baseTotalAmount ?? r.totalAmount) -
          ((r as any).baseTax ?? r.tax) +
          ((r as any).baseDiscount ?? r.discount),
        tax: (r as any).baseTax ?? r.tax,
        discount: (r as any).baseDiscount ?? r.discount,
        total: (r as any).baseTotalAmount ?? r.totalAmount,
        status: r.paymentStatus,
        method: r.payments?.[0]?.method || '—',
      })),
      totals: {
        date: 'TOTAL',
        subtotal: s.totalSales - s.totalTax + s.totalDiscount,
        tax: s.totalTax,
        discount: s.totalDiscount,
        total: s.totalSales,
      },
    };
  }

  // ── 2. Daily Summary ──

  async dailySummary(tenantId: string, storeId: string, q: any) {
    const match: any = {
      ...this.base(tenantId, storeId),
      type: 'sale',
      status: { $ne: 'cancelled' },
    };
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    if (dr) match.createdAt = dr;

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $unwind: { path: '$payments', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          cashSales: {
            $sum: {
              $cond: [
                { $eq: ['$payments.method', 'cash'] },
                { $ifNull: ['$payments.baseAmount', '$payments.amount'] },
                0,
              ],
            },
          },
          cardSales: {
            $sum: {
              $cond: [
                { $eq: ['$payments.method', 'card'] },
                { $ifNull: ['$payments.baseAmount', '$payments.amount'] },
                0,
              ],
            },
          },
          otherSales: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$payments.method', 'cash'] },
                    { $ne: ['$payments.method', 'card'] },
                  ],
                },
                { $ifNull: ['$payments.baseAmount', '$payments.amount'] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const salesByDay = await this.saleModel.aggregate(pipeline);

    const expMatch: any = { ...this.base(tenantId, storeId) };
    if (dr) expMatch.date = dr;
    const expAgg = await this.expenseModel.aggregate([
      { $match: expMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: { $ifNull: ['$baseTotal', '$total'] } },
        },
      },
    ]);
    const expMap: Record<string, number> = {};
    expAgg.forEach((e) => {
      expMap[e._id] = e.total;
    });

    const refundMatch: any = { ...this.base(tenantId, storeId), type: 'return' };
    if (dr) refundMatch.createdAt = dr;
    const refAgg = await this.saleModel.aggregate([
      { $match: refundMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: { $abs: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } } },
        },
      },
    ]);
    const refMap: Record<string, number> = {};
    refAgg.forEach((r) => {
      refMap[r._id] = r.total;
    });

    let runningBalance = 0;
    const data = salesByDay.map((d) => {
      const opening = runningBalance;
      const expenses = expMap[d._id] || 0;
      const refunds = refMap[d._id] || 0;
      const closing = opening + d.cashSales - expenses - refunds;
      runningBalance = closing;
      return {
        date: d._id,
        openingBalance: opening,
        cashSales: d.cashSales,
        cardSales: d.cardSales,
        other: d.otherSales,
        refunds,
        expenses,
        closingBalance: closing,
      };
    });

    const totals = data.reduce(
      (a, r) => ({
        cashSales: a.cashSales + r.cashSales,
        cardSales: a.cardSales + r.cardSales,
        other: a.other + r.other,
        refunds: a.refunds + r.refunds,
        expenses: a.expenses + r.expenses,
      }),
      { cashSales: 0, cardSales: 0, other: 0, refunds: 0, expenses: 0 },
    );

    return {
      summary: {
        totalSales: totals.cashSales + totals.cardSales + totals.other,
        cashSales: totals.cashSales,
        cardSales: totals.cardSales,
        totalRefunds: totals.refunds,
      },
      data,
      totals: {
        date: 'TOTAL',
        ...totals,
        closingBalance: data.length ? data[data.length - 1].closingBalance : 0,
      },
    };
  }

  // ── 3. Purchase Report ──

  async purchaseReport(tenantId: string, storeId: string, q: any) {
    const match: any = { ...this.base(tenantId, storeId) };
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    if (dr) match.createdAt = dr;

    const [rows, agg] = await Promise.all([
      this.poModel
        .find(match)
        .sort({ createdAt: -1 })
        .limit(500)
        .populate('supplierId', 'name')
        .lean(),
      this.poModel.aggregate([
        { $match: { ...match, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
            count: { $sum: 1 },
            tax: { $sum: { $ifNull: ['$baseTaxTotal', '$taxTotal'] } },
            shipping: { $sum: { $ifNull: ['$baseShipping', '$shipping'] } },
          },
        },
      ]),
    ]);

    const outstanding = await this.poModel.countDocuments({
      ...match,
      status: { $in: ['approved', 'ordered', 'partially_received'] },
    });
    const s = agg[0] || { total: 0, count: 0, tax: 0, shipping: 0 };

    return {
      summary: {
        totalPurchases: s.total,
        poCount: s.count,
        avgPoValue: s.count ? s.total / s.count : 0,
        outstanding,
      },
      data: rows.map((r) => ({
        date: (r as any).createdAt,
        poNo: r.poNumber,
        supplier: (r.supplierId as any)?.name || '—',
        items: r.items?.length || 0,
        subtotal: (r as any).baseSubtotal ?? r.subtotal,
        tax: (r as any).baseTaxTotal ?? r.taxTotal,
        shipping: (r as any).baseShipping ?? r.shipping,
        total: (r as any).baseTotalAmount ?? r.totalAmount,
        status: r.status,
      })),
      totals: {
        date: 'TOTAL',
        subtotal: s.total - s.tax - s.shipping,
        tax: s.tax,
        shipping: s.shipping,
        total: s.total,
      },
    };
  }

  // ── 4. Expense Report ──

  async expenseReport(tenantId: string, storeId: string, q: any) {
    const match: any = { ...this.base(tenantId, storeId) };
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    if (dr) match.date = dr;

    const rows = await this.expenseModel.find(match).sort({ date: -1 }).limit(500).lean();
    const total = rows.reduce(
      (s, r) => s + ((r as any).baseTotal ?? (r as any).total ?? r.amount ?? 0),
      0,
    );
    const categories = [...new Set(rows.map((r) => (r as any).category || 'Uncategorized'))];
    const days = new Set(rows.map((r) => new Date(r.date).toDateString())).size || 1;

    const byCat = rows.reduce((m: any, r: any) => {
      const c = r.category || 'Uncategorized';
      m[c] = (m[c] || 0) + ((r as any).baseTotal ?? (r as any).total ?? r.amount ?? 0);
      return m;
    }, {});
    const highest = Object.entries(byCat).sort((a: any, b: any) => b[1] - a[1])[0];

    return {
      summary: {
        totalExpenses: total,
        categoriesCount: categories.length,
        avgPerDay: total / days,
        highestCategory: highest ? highest[0] : '—',
      },
      data: rows.map((r) => ({
        date: r.date,
        category: (r as any).category || 'Uncategorized',
        description: r.description,
        reference: (r as any).reference || '—',
        amount: (r as any).baseTotal ?? (r as any).total ?? r.amount,
        tax: ((r as any).baseTax ?? (r as any).tax) || 0,
        paidBy: (r as any).paidBy || '—',
      })),
      totals: { date: 'TOTAL', amount: total },
    };
  }

  // ── 5. Inventory Report ──

  async inventoryReport(tenantId: string, storeId: string) {
    const b = this.base(tenantId, storeId);
    const products = await this.productModel
      .find({ ...b, isActive: true })
      .populate('categoryId', 'name')
      .lean();

    let lowStock = 0,
      outOfStock = 0;
    const data = products.map((p) => {
      const qty = (p as any).stock || 0;
      const reorder = (p as any).reorderLevel || 0;
      let status = 'in_stock';
      if (qty <= 0) {
        status = 'out';
        outOfStock++;
      } else if (qty <= reorder) {
        status = 'low';
        lowStock++;
      }
      return {
        sku: p.sku,
        productName: p.name,
        category: (p.categoryId as any)?.name || '—',
        warehouse: '—',
        inStock: qty,
        reorderLevel: reorder,
        status,
      };
    });

    return {
      summary: {
        totalSkus: products.length,
        totalUnits: data.reduce((s, r) => s + r.inStock, 0),
        lowStockItems: lowStock,
        outOfStock,
      },
      data,
    };
  }

  // ── 6. Inventory Valuation ──

  async inventoryValuation(tenantId: string, storeId: string) {
    const currencySnapshot = await this.currencyService.resolveSnapshot(
      tenantId,
      storeId,
      new Date(),
    );
    const stocks = await this.stockModel
      .find(this.base(tenantId, storeId))
      .populate('productId', 'name sku price costPrice categoryId')
      .populate('variantId', 'sku price cost')
      .lean();

    let totalCost = 0,
      totalRetail = 0;
    const data = stocks.map((stock: any) => {
      const product = stock.productId || {};
      const variant = stock.variantId || null;
      const qty = stock.quantity || 0;
      const cost = variant?.cost ?? product.costPrice ?? 0;
      const retail = variant?.price ?? product.price ?? 0;
      const baseCost = this.currencyService.toBase(cost, currencySnapshot);
      const baseRetail = this.currencyService.toBase(retail, currencySnapshot);
      const tc = qty * baseCost,
        tr = qty * baseRetail;
      totalCost += tc;
      totalRetail += tr;
      return {
        sku: variant?.sku || product.sku,
        productName: product.name,
        category: '—',
        qty,
        unitCost: baseCost,
        totalCost: tc,
        unitRetail: baseRetail,
        totalRetail: tr,
        marginPercent:
          baseRetail > 0 ? (((baseRetail - baseCost) / baseRetail) * 100).toFixed(1) : '0',
      };
    });

    return {
      summary: {
        totalCostValue: totalCost,
        totalRetailValue: totalRetail,
        potentialProfit: totalRetail - totalCost,
        itemsCount: stocks.length,
      },
      data,
      totals: { sku: 'TOTAL', totalCost, totalRetail },
    };
  }

  // ── 7. Dead Stock ──

  async deadStockReport(tenantId: string, storeId: string, q: any) {
    const b = this.base(tenantId, storeId);
    const currencySnapshot = await this.currencyService.resolveSnapshot(
      tenantId,
      storeId,
      new Date(),
    );
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (parseInt(q.days) || 90));

    const products = await this.productModel
      .find({ ...b, isActive: true })
      .populate('categoryId', 'name')
      .lean();
    const recentSales = await this.saleModel.distinct('items.productId', {
      ...b,
      type: 'sale',
      createdAt: { $gte: cutoff },
    });
    const recentSet = new Set(recentSales.map((id) => id.toString()));

    const deadItems = products.filter(
      (p) => !recentSet.has((p as any)._id.toString()) && ((p as any).stock || 0) > 0,
    );
    const now = Date.now();
    let totalValue = 0;

    const data = deadItems.map((p) => {
      const qty = (p as any).stock || 0;
      const cost = this.currencyService.toBase((p as any).costPrice || 0, currencySnapshot);
      const value = qty * cost;
      totalValue += value;
      const lastSold = (p as any).lastSoldAt;
      const days = lastSold ? Math.floor((now - new Date(lastSold).getTime()) / 86400000) : 999;
      return {
        sku: p.sku,
        productName: p.name,
        category: (p.categoryId as any)?.name || '—',
        qty,
        unitCost: cost,
        value,
        lastSold: lastSold || null,
        daysStagnant: days,
      };
    });

    return {
      summary: {
        deadStockItems: deadItems.length,
        totalValueTiedUp: totalValue,
        avgDaysStagnant: data.length
          ? Math.round(data.reduce((s, r) => s + r.daysStagnant, 0) / data.length)
          : 0,
        percentOfInventory: products.length
          ? ((deadItems.length / products.length) * 100).toFixed(1)
          : '0',
      },
      data: data.sort((a, b) => b.value - a.value),
      totals: { sku: 'TOTAL', value: totalValue },
    };
  }

  // ── 8. Stock Movement ──

  async stockMovement(tenantId: string, storeId: string, q: any) {
    const match: any = { ...this.base(tenantId, storeId) };
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    if (dr) match.createdAt = dr;

    const rows = await this.movementModel
      .find(match)
      .sort({ createdAt: -1 })
      .limit(1000)
      .populate('productId', 'name sku')
      .populate('warehouseId', 'name')
      .lean();

    let totalIn = 0,
      totalOut = 0,
      adjustments = 0;
    const data = rows.map((r) => {
      const qty = r.quantity || 0;
      const isIn =
        r.type === 'in' ||
        r.type === 'purchase' ||
        r.type === 'return' ||
        r.type === 'adjustment_add';
      const isAdj = r.type?.startsWith('adjustment');
      if (isIn) totalIn += qty;
      else totalOut += Math.abs(qty);
      if (isAdj) adjustments++;
      return {
        date: (r as any).createdAt,
        product: (r.productId as any)?.name || '—',
        type: r.type,
        reference: (r as any).referenceId?.toString()?.slice(-8) || '—',
        qtyIn: isIn ? qty : 0,
        qtyOut: isIn ? 0 : Math.abs(qty),
        balance: 0,
        warehouse: (r.warehouseId as any)?.name || '—',
      };
    });

    return {
      summary: { totalIn, totalOut, netMovement: totalIn - totalOut, adjustments },
      data,
      totals: { date: 'TOTAL', qtyIn: totalIn, qtyOut: totalOut },
    };
  }

  // ── 9. Customer Report ──

  async customerReport(tenantId: string, storeId: string, q: any) {
    const b = this.base(tenantId, storeId);
    const customers = await this.customerModel.find(b).lean();
    const dr = this.dateRange(q.dateFrom, q.dateTo);

    const salesMatch: any = { ...b, type: 'sale', status: { $ne: 'cancelled' } };
    if (dr) salesMatch.createdAt = dr;

    const salesAgg = await this.saleModel.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: '$customerId',
          orders: { $sum: 1 },
          totalSpent: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          lastOrder: { $max: '$createdAt' },
        },
      },
    ]);
    const salesMap: Record<string, any> = {};
    salesAgg.forEach((s) => {
      if (s._id) salesMap[s._id.toString()] = s;
    });

    let totalRevenue = 0;
    const data = customers.map((c) => {
      const s = salesMap[(c as any)._id.toString()] || {
        orders: 0,
        totalSpent: 0,
        lastOrder: null,
      };
      totalRevenue += s.totalSpent;
      return {
        name: c.name,
        email: c.email,
        phone: c.phone,
        orders: s.orders,
        totalSpent: s.totalSpent,
        avgOrder: s.orders ? s.totalSpent / s.orders : 0,
        lastOrder: s.lastOrder,
        loyaltyPoints: (c as any).loyaltyPoints || 0,
        outstanding: (c as any).outstandingBalance || 0,
      };
    });

    const active = data.filter((d) => d.orders > 0).length;
    return {
      summary: {
        totalCustomers: customers.length,
        activeCustomers: active,
        totalRevenue,
        avgSpend: customers.length ? totalRevenue / customers.length : 0,
      },
      data: data.sort((a, b) => b.totalSpent - a.totalSpent),
      totals: { name: 'TOTAL', totalSpent: totalRevenue },
    };
  }

  // ── 10. Supplier Report ──

  async supplierReport(tenantId: string, storeId: string, q: any) {
    const b = this.base(tenantId, storeId);
    const suppliers = await this.supplierModel.find(b).lean();
    const dr = this.dateRange(q.dateFrom, q.dateTo);

    const poMatch: any = { ...b, status: { $ne: 'cancelled' } };
    if (dr) poMatch.createdAt = dr;

    const poAgg = await this.poModel.aggregate([
      { $match: poMatch },
      {
        $group: {
          _id: '$supplierId',
          poCount: { $sum: 1 },
          totalPurchased: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          lastPO: { $max: '$createdAt' },
        },
      },
    ]);
    const poMap: Record<string, any> = {};
    poAgg.forEach((p) => {
      if (p._id) poMap[p._id.toString()] = p;
    });

    const invMatch: any = { ...b };
    if (dr) invMatch.invoiceDate = dr;
    const invAgg = await this.supplierInvoiceModel.aggregate([
      { $match: invMatch },
      {
        $group: {
          _id: '$supplierId',
          invoiced: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          paid: { $sum: { $ifNull: ['$basePaidAmount', '$paidAmount'] } },
          outstanding: { $sum: { $ifNull: ['$baseBalanceDue', '$balanceDue'] } },
        },
      },
    ]);
    const invMap: Record<string, any> = {};
    invAgg.forEach((i) => {
      if (i._id) invMap[i._id.toString()] = i;
    });

    let totalPurchased = 0,
      totalPaid = 0,
      totalOutstanding = 0;
    const data = suppliers.map((s) => {
      const po = poMap[(s as any)._id.toString()] || {
        poCount: 0,
        totalPurchased: 0,
        lastPO: null,
      };
      const inv = invMap[(s as any)._id.toString()] || { invoiced: 0, paid: 0, outstanding: 0 };
      const purchased = inv.invoiced || po.totalPurchased;
      const paid = inv.paid || 0;
      const outstanding = inv.invoiced ? inv.outstanding : Math.max(0, po.totalPurchased - paid);
      totalPurchased += purchased;
      totalPaid += paid;
      totalOutstanding += outstanding;
      return {
        name: s.name,
        contact: s.email || s.phone || '—',
        poCount: po.poCount,
        totalPurchased: purchased,
        paid,
        outstanding: Math.max(0, outstanding),
        avgDeliveryDays: 0,
        lastPO: po.lastPO,
      };
    });

    return {
      summary: {
        totalSuppliers: suppliers.length,
        activeSuppliers: data.filter((d) => d.poCount > 0).length,
        totalPurchased,
        outstandingPayments: Math.max(0, totalOutstanding),
      },
      data: data.sort((a, b) => b.totalPurchased - a.totalPurchased),
      totals: {
        name: 'TOTAL',
        totalPurchased,
        paid: totalPaid,
        outstanding: Math.max(0, totalOutstanding),
      },
    };
  }

  // ── 11. VAT / Tax Report ──

  async vatTaxReport(tenantId: string, storeId: string, q: any) {
    const b = this.base(tenantId, storeId);
    const dr = this.dateRange(q.dateFrom, q.dateTo);

    const salesMatch: any = { ...b, type: 'sale', status: { $ne: 'cancelled' } };
    if (dr) salesMatch.createdAt = dr;

    const salesAgg = await this.saleModel.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          revenue: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          salesTax: { $sum: { $ifNull: ['$baseTax', '$tax'] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const poMatch: any = { ...b, status: { $ne: 'cancelled' } };
    if (dr) poMatch.createdAt = dr;

    const poAgg = await this.poModel.aggregate([
      { $match: poMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          purchaseCost: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          purchaseTax: { $sum: { $ifNull: ['$baseTaxTotal', '$taxTotal'] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const poMap: Record<string, any> = {};
    poAgg.forEach((p) => {
      poMap[p._id] = p;
    });

    let totalSalesTax = 0,
      totalPurchaseTax = 0;
    const periods = new Set([...salesAgg.map((s) => s._id), ...poAgg.map((p) => p._id)]);
    const data = [...periods].sort().map((period) => {
      const s = salesAgg.find((x) => x._id === period) || { revenue: 0, salesTax: 0 };
      const p = poMap[period] || { purchaseCost: 0, purchaseTax: 0 };
      totalSalesTax += s.salesTax;
      totalPurchaseTax += p.purchaseTax;
      return {
        period,
        salesRevenue: s.revenue,
        salesTax: s.salesTax,
        purchaseCost: p.purchaseCost,
        purchaseTax: p.purchaseTax,
        netTax: s.salesTax - p.purchaseTax,
      };
    });

    return {
      summary: {
        totalTaxCollected: totalSalesTax,
        totalTaxPaid: totalPurchaseTax,
        netTaxPayable: totalSalesTax - totalPurchaseTax,
        taxRate: '—',
      },
      data,
      totals: {
        period: 'TOTAL',
        salesRevenue: data.reduce((s, r) => s + r.salesRevenue, 0),
        salesTax: totalSalesTax,
        purchaseCost: data.reduce((s, r) => s + r.purchaseCost, 0),
        purchaseTax: totalPurchaseTax,
        netTax: totalSalesTax - totalPurchaseTax,
      },
    };
  }

  // ── 12. Profit & Loss ──

  async profitLoss(tenantId: string, storeId: string, q: any) {
    const b = this.base(tenantId, storeId);
    const dr = this.dateRange(q.dateFrom, q.dateTo);

    const salesMatch: any = { ...b, type: 'sale', status: { $ne: 'cancelled' } };
    if (dr) salesMatch.createdAt = dr;
    const salesAgg = await this.saleModel.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          tax: { $sum: { $ifNull: ['$baseTax', '$tax'] } },
          discount: { $sum: { $ifNull: ['$baseDiscount', '$discount'] } },
        },
      },
    ]);

    const returnMatch: any = { ...b, type: 'return' };
    if (dr) returnMatch.createdAt = dr;
    const returnAgg = await this.saleModel.aggregate([
      { $match: returnMatch },
      {
        $group: {
          _id: null,
          total: { $sum: { $abs: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } } },
        },
      },
    ]);

    const cogsAgg = await this.saleModel.aggregate([
      { $match: salesMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$items.baseLineCost', '$items.lineCost'] } },
        },
      },
    ]);
    const returnCogsAgg = await this.saleModel.aggregate([
      { $match: returnMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$items.baseLineCost', '$items.lineCost'] } },
        },
      },
    ]);

    const expMatch: any = { ...b };
    if (dr) expMatch.date = dr;
    const expAgg = await this.expenseModel.aggregate([
      { $match: expMatch },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$baseTotal', '$total'] } } } },
    ]);

    const revenue = salesAgg[0]?.revenue || 0;
    const returns = returnAgg[0]?.total || 0;
    const cogs = (cogsAgg[0]?.total || 0) - (returnCogsAgg[0]?.total || 0);
    const expenses = expAgg[0]?.total || 0;
    const netRevenue = revenue - returns;
    const grossProfit = netRevenue - cogs;
    const netProfit = grossProfit - expenses;

    return {
      summary: { totalRevenue: netRevenue, totalCOGS: cogs, grossProfit, netProfit },
      data: [
        { category: 'Income', description: 'Sales Revenue', amount: revenue },
        { category: 'Income', description: 'Less: Returns', amount: -returns },
        { category: 'Income', description: 'Net Revenue', amount: netRevenue },
        { category: 'COGS', description: 'Cost of Goods Sold', amount: -cogs },
        { category: 'Profit', description: 'Gross Profit', amount: grossProfit },
        { category: 'Expenses', description: 'Operating Expenses', amount: -expenses },
        { category: 'Profit', description: 'Net Profit', amount: netProfit },
      ],
      totals: { category: '', description: 'NET PROFIT', amount: netProfit },
    };
  }

  // ── 13. Transfer Report ──

  async transferReport(tenantId: string, storeId: string, q: any) {
    const match: any = { ...this.base(tenantId, storeId) };
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    if (dr) match.date = dr;

    const rows = await this.transferModel
      .find(match)
      .sort({ date: -1 })
      .limit(500)
      .populate('createdBy', 'fullName')
      .lean();

    const pending = rows.filter((r) => r.status === 'draft' || r.status === 'in_transit').length;
    const completed = rows.filter((r) => r.status === 'completed').length;
    const totalItems = rows.reduce((s, r) => s + (r.items?.length || 0), 0);

    return {
      summary: {
        totalTransfers: rows.length,
        itemsTransferred: totalItems,
        pendingTransfers: pending,
        completedTransfers: completed,
      },
      data: rows.map((r) => ({
        date: r.date,
        transferNumber: r.transferNumber,
        fromWarehouse: r.fromWarehouseName || '—',
        toWarehouse: r.toWarehouseName || '—',
        items: r.items?.length || 0,
        status: r.status,
        initiatedBy: (r.createdBy as any)?.fullName || '—',
      })),
    };
  }

  // ── 14. Staff Performance ──

  async staffPerformance(tenantId: string, storeId: string, q: any) {
    const b = this.base(tenantId, storeId);
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    const salesMatch: any = { ...b, type: 'sale', status: { $ne: 'cancelled' } };
    if (dr) salesMatch.createdAt = dr;

    const agg = await this.saleModel.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: '$cashierId',
          salesCount: { $sum: 1 },
          salesTotal: { $sum: { $ifNull: ['$baseTotalAmount', '$totalAmount'] } },
          itemsSold: { $sum: { $size: '$items' } },
        },
      },
    ]);

    const returnMatch: any = { ...b, type: 'return' };
    if (dr) returnMatch.createdAt = dr;
    const retAgg = await this.saleModel.aggregate([
      { $match: returnMatch },
      { $group: { _id: '$cashierId', returns: { $sum: 1 } } },
    ]);
    const retMap: Record<string, number> = {};
    retAgg.forEach((r) => {
      if (r._id) retMap[r._id.toString()] = r.returns;
    });

    const userIds = agg.filter((a) => a._id).map((a) => a._id);
    const users = await this.userModel.find({ _id: { $in: userIds } }).lean();
    const userMap: Record<string, any> = {};
    users.forEach((u) => {
      userMap[(u as any)._id.toString()] = u;
    });

    let totalSales = 0,
      totalCount = 0,
      totalReturns = 0,
      totalItems = 0;
    const data = agg
      .filter((a) => a._id)
      .map((a) => {
        const user = userMap[a._id.toString()];
        const returns = retMap[a._id.toString()] || 0;
        totalSales += a.salesTotal;
        totalCount += a.salesCount;
        totalReturns += returns;
        totalItems += a.itemsSold;
        return {
          staffName: user?.fullName || '—',
          role: user?.role || '—',
          salesCount: a.salesCount,
          salesTotal: a.salesTotal,
          returns,
          avgTransaction: a.salesCount ? a.salesTotal / a.salesCount : 0,
          hoursWorked: 0,
          itemsSold: a.itemsSold,
        };
      })
      .sort((a, b) => b.salesTotal - a.salesTotal);

    const topPerformer = data[0]?.staffName || '—';

    return {
      summary: {
        totalStaff: data.length,
        totalSales,
        avgSalesPerStaff: data.length ? totalSales / data.length : 0,
        topPerformer,
      },
      data,
      totals: {
        staffName: 'TOTAL',
        salesCount: totalCount,
        salesTotal: totalSales,
        returns: totalReturns,
        itemsSold: totalItems,
      },
    };
  }

  async shiftReport(tenantId: string, storeId: string, q: any) {
    const match: any = this.base(tenantId, storeId);
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    if (dr) match.openedAt = dr;
    if (q.status) match.status = q.status;
    const rows = await this.posShiftModel
      .find(match)
      .sort({ openedAt: -1 })
      .limit(500)
      .populate('cashierId', 'fullName')
      .lean();
    const data = rows.map((row: any) => ({
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      cashier: row.cashierId?.fullName || '—',
      terminalId: row.terminalId,
      status: row.status,
      salesCount: row.totals?.salesCount || 0,
      grossSales: row.totals?.grossSales || 0,
      refunds: row.totals?.refunds || 0,
      expectedCash: row.expectedCash || 0,
      countedCash: row.countedCash || 0,
      variance: row.variance ?? 0,
    }));
    return {
      summary: {
        shifts: data.length,
        totalSales: data.reduce((sum, row) => sum + Number(row.salesCount || 0), 0),
        grossSales: data.reduce((sum, row) => sum + Number(row.grossSales || 0), 0),
      },
      data,
      totals: {
        openedAt: 'TOTAL',
        salesCount: data.reduce((sum, row) => sum + Number(row.salesCount || 0), 0),
        grossSales: data.reduce((sum, row) => sum + Number(row.grossSales || 0), 0),
        refunds: data.reduce((sum, row) => sum + Number(row.refunds || 0), 0),
        variance: data.reduce((sum, row) => sum + Number(row.variance || 0), 0),
      },
    };
  }

  // ── 15. Variant Sell-Through ──

  async variantSellThrough(tenantId: string, storeId: string, q: Record<string, string>) {
    return this.apparelSellThrough(tenantId, storeId, q);
  }

  /** @deprecated use variantSellThrough */
  async apparelSellThrough(tenantId: string, storeId: string, q: Record<string, string>) {
    const b = this.base(tenantId, storeId);
    const dr = this.dateRange(q.dateFrom, q.dateTo);

    const salesMatch: Record<string, unknown> = {
      ...b,
      type: 'sale',
      status: { $ne: 'cancelled' },
    };
    if (dr) salesMatch.date = dr;

    const soldAgg = await this.saleModel.aggregate([
      { $match: salesMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          sku: { $first: '$items.sku' },
          soldQty: { $sum: '$items.quantity' },
          soldValue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
        },
      },
    ]);

    const grnMatch: Record<string, unknown> = { ...b };
    if (dr) grnMatch.createdAt = dr;
    const receivedAgg = await this.grnModel.aggregate([
      { $match: grnMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          receivedQty: { $sum: '$items.quantity' },
        },
      },
    ]);

    const receivedMap: Record<string, number> = {};
    receivedAgg.forEach((r) => {
      if (r._id) receivedMap[r._id.toString()] = r.receivedQty;
    });

    const data = soldAgg
      .map((row) => {
        const pid = row._id?.toString?.() || String(row._id);
        const received = receivedMap[pid] || 0;
        const sold = row.soldQty || 0;
        const sellThrough = received > 0 ? Math.round((sold / received) * 1000) / 10 : null;
        return {
          productId: pid,
          productName: row.productName,
          sku: row.sku || '',
          soldQty: sold,
          receivedQty: received,
          soldValue: row.soldValue,
          sellThroughPct: sellThrough,
        };
      })
      .sort((a, b) => b.soldQty - a.soldQty);

    const totalSold = data.reduce((s, r) => s + r.soldQty, 0);
    const totalReceived = data.reduce((s, r) => s + r.receivedQty, 0);

    return {
      summary: {
        styles: data.length,
        totalSold,
        totalReceived,
        overallSellThrough:
          totalReceived > 0 ? Math.round((totalSold / totalReceived) * 1000) / 10 : null,
      },
      data,
    };
  }

  // ── 16. Variant Attribute Breakdown ──

  async variantAttributeBreakdown(
    tenantId: string,
    storeId: string,
    productId: string,
    q: Record<string, string>,
  ) {
    return this.apparelSizeCurve(tenantId, storeId, productId, q);
  }

  /** @deprecated use variantAttributeBreakdown */
  async apparelSizeCurve(
    tenantId: string,
    storeId: string,
    productId: string,
    q: Record<string, string>,
  ) {
    if (!productId) {
      return { summary: { totalUnits: 0 }, data: [] };
    }

    const b = this.base(tenantId, storeId);
    const dr = this.dateRange(q.dateFrom, q.dateTo);
    const salesMatch: Record<string, unknown> = {
      ...b,
      type: 'sale',
      status: { $ne: 'cancelled' },
      'items.productId': new Types.ObjectId(productId),
    };
    if (dr) salesMatch.date = dr;

    const attributeName = q.attributeName || q.attribute || 'Size';

    const variantRows = await this.variantModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        productId: new Types.ObjectId(productId),
      })
      .lean();

    const variantAttrMap: Record<string, string> = {};
    variantRows.forEach((v) => {
      const attrs =
        v.attributeValues instanceof Map
          ? Object.fromEntries(v.attributeValues.entries())
          : (v.attributeValues as Record<string, string>) || {};
      const matchKey = Object.keys(attrs).find(
        (k) => k.toLowerCase() === attributeName.toLowerCase(),
      );
      const value = matchKey
        ? attrs[matchKey]
        : attrs[attributeName] || attrs.Size || attrs.size || Object.values(attrs)[0] || 'Unknown';
      variantAttrMap[v._id.toString()] = value;
    });

    const sales = await this.saleModel.find(salesMatch).select('items').lean();
    const attrCounts: Record<string, number> = {};
    let totalUnits = 0;

    for (const sale of sales) {
      for (const item of sale.items || []) {
        if (item.productId?.toString?.() !== productId) continue;
        const vid = item.variantId?.toString?.() || '';
        const attrValue = variantAttrMap[vid] || 'Standard';
        attrCounts[attrValue] = (attrCounts[attrValue] || 0) + item.quantity;
        totalUnits += item.quantity;
      }
    }

    const data = Object.entries(attrCounts)
      .map(([attributeValue, qty]) => ({
        attribute: attributeName,
        attributeValue,
        size: attributeValue,
        quantity: qty,
        percentage: totalUnits > 0 ? Math.round((qty / totalUnits) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    const product = await this.productModel.findById(productId).select('name sku').lean();

    return {
      summary: {
        productName: (product as any)?.name || 'Product',
        sku: (product as any)?.sku || '',
        totalUnits,
        attributeName,
        attributeValues: data.length,
        sizes: data.length,
      },
      data,
    };
  }
}
