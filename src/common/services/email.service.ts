import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  renderEmailLayout,
  infoBox,
  otpCodeBlock,
  dataTable,
  bulletList,
} from '../email/email-templates';
import { QueueService } from '../queue/queue.service';
import {
  EmailDeliveryLog,
  EmailDeliveryLogDocument,
} from '../../database/schemas/email-delivery-log.schema';
import { EmailJobData } from './email-queue.processor';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private configService: ConfigService,
    private queueService: QueueService,
    @InjectModel(EmailDeliveryLog.name) private deliveryLogModel: Model<EmailDeliveryLogDocument>,
  ) {}

  private frontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  /**
   * .local addresses (e.g. admin@swiftpos.local) cannot receive real mail.
   * When ADMIN_EMAIL is set, route those messages to that inbox instead.
   */
  private resolveRecipient(recipient: string): string {
    const domain = recipient.split('@')[1]?.toLowerCase() ?? '';
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    if (adminEmail && domain.endsWith('.local')) {
      this.logger.log(`Routing ${recipient} → ${adminEmail} (.local address)`);
      return adminEmail;
    }
    return recipient;
  }

  private escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Records a delivery-log row up front (so a failed send is never invisible —
   * this is what closes the "silently dropped OTP" gap) and hands the actual
   * transport off to the queue. With REDIS_URL configured this is durable and
   * retried with backoff; without it, EmailQueueProcessor's handler runs
   * inline immediately — see QueueService for why callers don't need to know
   * which path they're on.
   */
  private async send(
    to: string,
    subject: string,
    html: string,
    templateType: string,
  ): Promise<void> {
    const deliveryTo = this.resolveRecipient(to);
    const finalSubject = deliveryTo !== to ? `${subject} (for ${to})` : subject;

    const logDoc = await this.deliveryLogModel.create({
      to: deliveryTo,
      subject: finalSubject,
      templateType,
      status: 'queued',
    });

    try {
      await this.queueService.enqueue<EmailJobData>('email', 'send', {
        logId: logDoc._id.toString(),
        to: deliveryTo,
        subject: finalSubject,
        html,
      });
    } catch (err: unknown) {
      // enqueue() itself only throws on unexpected errors (e.g. Redis dropped
      // mid-call) — the "no Redis configured" path never throws, it just runs
      // inline. Either way, don't let a queueing failure take down the caller.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to queue email to ${deliveryTo}: ${message}`);
      await this.deliveryLogModel.updateOne(
        { _id: logDoc._id },
        { $set: { status: 'failed', lastError: message } },
      );
    }
  }

  // ── OTP / verification ─────────────────────────────────────────────────────

  async sendOtpCode(email: string, code: string): Promise<void> {
    this.logger.log(`OTP code for ${email}: ${code}`);
    const html = renderEmailLayout({
      preheader: `Your verification code is ${code}`,
      icon: 'mail',
      title: 'Verify your email',
      subtitle: 'Enter this one-time code in SwiftPOS to complete your sign-up or sign-in.',
      bodyHtml: `
        ${otpCodeBlock(code)}
        <p style="margin:0;font-size:14px;line-height:1.6;color:#64748B;">This code expires in <strong>10 minutes</strong>. Never share it with anyone.</p>
      `,
      footerNote: "If you didn't request this code, you can safely ignore this email.",
    });
    await this.send(email, `${code} — your SwiftPOS verification code`, html, 'otp');
  }

  async sendOtp(email: string, code: string, _name?: string): Promise<void> {
    await this.sendOtpCode(email, code);
  }

  async sendPasswordResetOtp(email: string, code: string): Promise<void> {
    const html = renderEmailLayout({
      preheader: 'Reset your SwiftPOS password',
      icon: 'key',
      title: 'Reset your password',
      subtitle: 'We received a request to reset your password. Use the code below.',
      bodyHtml: `
        ${otpCodeBlock(code)}
        <p style="margin:0;font-size:14px;line-height:1.6;color:#64748B;">After entering the code, choose a strong new password you haven't used before.</p>
      `,
      footerNote:
        "If you didn't request a password reset, ignore this email — your account stays secure.",
    });
    await this.send(email, 'Reset your SwiftPOS password', html, 'password-reset-otp');
  }

  // ── Team & onboarding ──────────────────────────────────────────────────────

  async sendInvite(
    email: string,
    data: {
      tenantName: string;
      invitedBy: string;
      role: string;
      tempPassword: string;
      acceptUrl: string;
    },
  ): Promise<void> {
    const html = renderEmailLayout({
      preheader: `You've been invited to ${data.tenantName}`,
      icon: 'user',
      title: "You're invited to the team",
      subtitle: `${data.invitedBy} added you to ${data.tenantName} as ${data.role}.`,
      bodyHtml: `
        ${infoBox([
          { label: 'Organization', value: data.tenantName },
          { label: 'Your role', value: data.role },
          { label: 'Work email', value: email },
          { label: 'Temporary password', value: data.tempPassword },
        ])}
        ${bulletList([
          'Sign in with the email and temporary password above',
          'Change your password after your first login',
          'Contact your manager if you need store access',
        ])}
      `,
      cta: { label: 'Accept invitation', url: data.acceptUrl },
      footerNote: 'This invitation was sent by your organization administrator.',
    });
    await this.send(email, `Join ${data.tenantName} on SwiftPOS`, html, 'invite');
  }

  async sendEmployeeCredentials(
    email: string,
    data: {
      employeeName: string;
      role: string;
      tenantName: string;
      email: string;
      tempPassword: string;
      loginUrl: string;
      invitedBy: string;
    },
  ): Promise<void> {
    const html = renderEmailLayout({
      preheader: `Your SwiftPOS login for ${data.tenantName}`,
      icon: 'user',
      title: 'Your portal account is ready',
      subtitle: `${data.invitedBy} created your SwiftPOS account at ${data.tenantName}.`,
      bodyHtml: `
        ${infoBox([
          { label: 'Organization', value: data.tenantName },
          { label: 'Your role', value: data.role.replace(/_/g, ' ') },
          { label: 'Login email', value: data.email },
          { label: 'Temporary password', value: data.tempPassword },
        ])}
        ${bulletList([
          'Sign in using the email and temporary password above',
          'Go to Profile → Security to change your password after login',
          'Your password is stored securely (hashed) on our servers',
          'Contact your manager if you need access to additional stores',
        ])}
      `,
      cta: { label: 'Sign in to SwiftPOS', url: data.loginUrl },
      footerNote: 'Keep this email private. Delete it after you set a new password.',
    });
    await this.send(
      email,
      `Your SwiftPOS login — ${data.tenantName}`,
      html,
      'employee-credentials',
    );
  }

  async sendEmployeeAdded(
    email: string,
    data: {
      employeeName: string;
      role: string;
      tenantName: string;
      addedBy: string;
      loginUrl?: string;
    },
  ): Promise<void> {
    await this.sendEmployeeCredentials(email, {
      employeeName: data.employeeName,
      tenantName: data.tenantName,
      role: data.role,
      email,
      tempPassword: '(contact your administrator)',
      loginUrl: data.loginUrl || `${this.frontendUrl()}/login`,
      invitedBy: data.addedBy,
    });
  }

  async sendWelcome(email: string, name: string): Promise<void> {
    const html = renderEmailLayout({
      preheader: 'Your SwiftPOS account is ready',
      icon: 'check',
      title: `Welcome, ${name}!`,
      subtitle: 'Your account is verified and ready. Here is how to get started.',
      bodyHtml: bulletList([
        'Complete your business profile in Settings',
        'Add products and set up inventory',
        'Invite cashiers and managers to your team',
        'Open the POS and process your first sale',
      ]),
      cta: { label: 'Open dashboard', url: `${this.frontendUrl()}/dashboard` },
    });
    await this.send(email, 'Welcome to SwiftPOS', html, 'welcome');
  }

  // ── Store & operations ─────────────────────────────────────────────────────

  async sendStoreCreated(
    email: string,
    data: {
      storeName: string;
      storeCode: string;
      tenantName: string;
      createdBy: string;
      address?: string;
    },
  ): Promise<void> {
    const html = renderEmailLayout({
      preheader: `New store: ${data.storeName}`,
      icon: 'document',
      title: 'New store created',
      subtitle: `A new location was added to ${data.tenantName}.`,
      bodyHtml: infoBox([
        { label: 'Store name', value: data.storeName },
        { label: 'Store code', value: data.storeCode },
        { label: 'Created by', value: data.createdBy },
        ...(data.address ? [{ label: 'Address', value: data.address }] : []),
      ]),
      cta: { label: 'Manage stores', url: `${this.frontendUrl()}/stores` },
    });
    await this.send(email, `Store created: ${data.storeName}`, html, 'store-created');
  }

  // ── Reports & alerts ───────────────────────────────────────────────────────

  async sendSalesReport(
    email: string,
    data: {
      storeName: string;
      periodLabel: string;
      totalSales: number;
      totalOrders: number;
      currency?: string;
      topProducts?: { name: string; qty: number; revenue: number }[];
    },
  ): Promise<void> {
    const currency = data.currency || 'USD';
    const fmt = (n: number) =>
      `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const productRows =
      data.topProducts?.slice(0, 5).map((p) => [p.name, String(p.qty), fmt(p.revenue)]) ?? [];

    const html = renderEmailLayout({
      preheader: `Sales report for ${data.periodLabel}`,
      icon: 'document',
      title: 'Your sales summary',
      subtitle: `${data.storeName} · ${data.periodLabel}`,
      bodyHtml: `
        ${infoBox([
          { label: 'Total sales', value: fmt(data.totalSales) },
          { label: 'Orders', value: String(data.totalOrders) },
          { label: 'Period', value: data.periodLabel },
        ])}
        ${
          productRows.length
            ? `<p style="margin:20px 0 8px;font-size:13px;font-weight:600;color:#0F172A;">Top products</p>${dataTable(['Product', 'Qty', 'Revenue'], productRows)}`
            : ''
        }
      `,
      cta: { label: 'View full reports', url: `${this.frontendUrl()}/reports/sales` },
    });
    await this.send(email, `Sales report — ${data.periodLabel}`, html, 'sales-report');
  }

  async sendLowStockAlert(
    email: string,
    products: { name: string; quantity: number }[],
  ): Promise<void> {
    const rows = products.map((p) => [p.name, String(p.quantity)]);
    const html = renderEmailLayout({
      preheader: 'Low stock items need attention',
      icon: 'document',
      title: 'Low stock alert',
      subtitle: 'The following products are below their reorder threshold.',
      bodyHtml: dataTable(['Product', 'Qty left'], rows),
      cta: { label: 'View reorder alerts', url: `${this.frontendUrl()}/inventory/reorder-alerts` },
    });
    await this.send(email, 'Low stock alert — SwiftPOS', html, 'low-stock-alert');
  }

  async sendTrialExpiryReminder(
    email: string,
    data: {
      name: string;
      tenantName: string;
      daysLeft: number;
      expiryDate: string;
    },
  ): Promise<void> {
    const billingUrl = `${this.frontendUrl()}/billing`;
    const isExpired = data.daysLeft <= 0;
    const title = isExpired
      ? 'Your trial has ended'
      : data.daysLeft === 1
        ? 'Your trial ends tomorrow'
        : `Your trial ends in ${data.daysLeft} days`;
    const subtitle = isExpired
      ? 'Upgrade now to keep using SwiftPOS without interruption.'
      : 'Upgrade before your trial ends to keep full access to your store data.';

    const html = renderEmailLayout({
      preheader: isExpired ? 'Upgrade to continue using SwiftPOS' : title,
      icon: isExpired ? 'lock' : 'document',
      eyebrow: 'Trial reminder',
      title,
      subtitle,
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
          Hi ${this.escapeHtml(data.name)}, your SwiftPOS trial for <strong>${this.escapeHtml(data.tenantName)}</strong>
          ${isExpired ? 'has expired' : `expires on <strong>${this.escapeHtml(data.expiryDate)}</strong>`}.
        </p>
        ${infoBox([
          { label: 'Organization', value: data.tenantName },
          { label: isExpired ? 'Expired on' : 'Expires on', value: data.expiryDate },
          ...(isExpired ? [] : [{ label: 'Days remaining', value: String(data.daysLeft) }]),
        ])}
        ${bulletList(
          isExpired
            ? [
                'Your account is read-only until you choose a plan',
                'Your products, sales, and inventory data are preserved',
                'Upgrade anytime to restore full access',
              ]
            : [
                'Choose a plan that fits your store before the trial ends',
                'All your data stays intact when you upgrade',
                'Billing takes only a few minutes from your dashboard',
              ],
        )}
      `,
      cta: { label: isExpired ? 'Upgrade now' : 'View plans', url: billingUrl },
      footerNote: 'Questions about plans? Reply to this email or contact support@swiftpos.io.',
    });

    const subject = isExpired
      ? 'Your SwiftPOS trial has ended — upgrade to continue'
      : `SwiftPOS trial ending in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}`;

    await this.send(email, subject, html, 'trial-expiry');
  }

  async sendPaymentReminder(
    email: string,
    data: { invoiceNumber: string; amount: number; dueDate: string; currency?: string },
  ): Promise<void> {
    const currency = data.currency || 'USD';
    const html = renderEmailLayout({
      icon: 'lock',
      title: 'Payment reminder',
      subtitle: 'Your subscription payment is due soon.',
      bodyHtml: infoBox([
        { label: 'Invoice', value: data.invoiceNumber },
        { label: 'Amount', value: `${currency} ${data.amount.toFixed(2)}` },
        { label: 'Due date', value: data.dueDate },
      ]),
      cta: { label: 'Pay now', url: `${this.frontendUrl()}/billing` },
    });
    await this.send(email, `Payment reminder — ${data.invoiceNumber}`, html, 'payment-reminder');
  }

  async sendInvoice(
    email: string,
    data: {
      invoiceNumber: string;
      total: number;
      currency?: string;
      items: { name: string; qty: number; price: number }[];
    },
  ): Promise<void> {
    const currency = data.currency || 'USD';
    const rows = data.items.map((i) => [
      i.name,
      String(i.qty),
      `${currency} ${i.price.toFixed(2)}`,
    ]);
    const html = renderEmailLayout({
      icon: 'document',
      title: `Invoice ${data.invoiceNumber}`,
      subtitle: 'Thank you for your business.',
      bodyHtml: dataTable(['Item', 'Qty', 'Amount'], rows, {
        label: 'Total',
        value: `${currency} ${data.total.toFixed(2)}`,
      }),
    });
    await this.send(email, `Invoice ${data.invoiceNumber}`, html, 'invoice');
  }

  async sendMaintenanceAlert(
    email: string,
    data: {
      name: string;
      tenantName: string;
      key: string;
      windowLabel: string;
      noticeMessage: string;
      estimate: string;
      apologyMessage?: string;
    },
  ): Promise<void> {
    const isStarted = data.key === 'started';
    const isCompleted = data.key === 'completed';
    const isHour = data.key === 'advance_1h';

    let title = 'Scheduled maintenance notice';
    let subtitle = data.noticeMessage;
    if (data.key === 'advance_30d') {
      title = 'Maintenance scheduled in 30 days';
      subtitle = 'We are giving you advance notice so you can plan around the downtime.';
    } else if (data.key === 'advance_7d') {
      title = 'Maintenance scheduled in 7 days';
      subtitle = 'This is a reminder about upcoming SwiftPOS maintenance.';
    } else if (data.key === 'advance_1d') {
      title = 'Maintenance scheduled tomorrow';
      subtitle = 'Final reminder — please save open work before the window begins.';
    } else if (isHour) {
      title = 'Maintenance begins in 1 hour';
      subtitle = 'SwiftPOS will be temporarily unavailable soon.';
    } else if (isStarted) {
      title = 'Maintenance in progress';
      subtitle = 'SwiftPOS is currently undergoing scheduled maintenance.';
    } else if (isCompleted) {
      title = 'Maintenance completed';
      subtitle = 'SwiftPOS is back online. Thank you for your patience.';
    }

    const html = renderEmailLayout({
      preheader: title,
      icon: isCompleted ? 'check' : isStarted ? 'lock' : 'document',
      eyebrow: 'Platform maintenance',
      title,
      subtitle,
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
          Hi ${this.escapeHtml(data.name)}, this notice applies to <strong>${this.escapeHtml(data.tenantName)}</strong>.
        </p>
        ${infoBox([
          { label: 'Maintenance window', value: data.windowLabel },
          { label: 'Expected duration', value: data.estimate },
        ])}
        <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#475569;">${this.escapeHtml(data.noticeMessage)}</p>
        ${
          data.apologyMessage && !isCompleted
            ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#64748B;font-style:italic;">${this.escapeHtml(data.apologyMessage)}</p>`
            : ''
        }
        ${bulletList(
          isCompleted
            ? [
                'All services should be available again',
                'Refresh your browser if you still see the maintenance page',
                'Contact support if you experience any issues',
              ]
            : isStarted
              ? [
                  'The app is temporarily unavailable during this window',
                  'Your data is safe — no action is required',
                  'We will notify you when maintenance is complete',
                ]
              : [
                  'Save open POS transactions before the window starts',
                  'Plan alternate workflows if you operate during this time',
                  'In-app alerts will remind you as the window approaches',
                ],
        )}
      `,
      cta: isCompleted
        ? { label: 'Open SwiftPOS', url: `${this.frontendUrl()}/dashboard` }
        : undefined,
      footerNote: 'Status updates are also shown in your SwiftPOS notification center.',
    });

    const subject = isCompleted
      ? 'SwiftPOS maintenance completed — you can sign in again'
      : isStarted
        ? 'SwiftPOS maintenance has started'
        : isHour
          ? 'SwiftPOS maintenance begins in 1 hour'
          : `SwiftPOS maintenance notice — ${title}`;

    await this.send(email, subject, html, 'maintenance-alert');
  }

  async sendDunningReminder(
    email: string,
    data: {
      name: string;
      tenantName: string;
      daysOverdue: number;
      planName: string;
      isFinalWarning?: boolean;
    },
  ): Promise<void> {
    const billingUrl = `${this.frontendUrl()}/billing`;
    const title = data.isFinalWarning
      ? 'Final notice — update payment today'
      : data.daysOverdue === 0
        ? 'Payment failed — action required'
        : `Payment overdue — day ${data.daysOverdue}`;

    const html = renderEmailLayout({
      preheader: title,
      icon: 'lock',
      eyebrow: 'Billing',
      title,
      subtitle: data.isFinalWarning
        ? 'Your account will be suspended if payment is not received.'
        : 'Update your payment method to avoid service interruption.',
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
          Hi ${this.escapeHtml(data.name)}, we could not process payment for
          <strong>${this.escapeHtml(data.tenantName)}</strong> (${this.escapeHtml(data.planName)}).
        </p>
        ${infoBox([
          { label: 'Organization', value: data.tenantName },
          { label: 'Days overdue', value: String(data.daysOverdue) },
          { label: 'Status', value: data.isFinalWarning ? 'Final warning' : 'Past due' },
        ])}
        ${bulletList(
          data.isFinalWarning
            ? [
                'Access will be restricted after today if payment fails',
                'Your store data remains safe',
                'Update billing from your dashboard',
              ]
            : [
                'Retry your payment or update your card',
                'Clear communication helps avoid accidental churn',
                'Contact support if you believe this is an error',
              ],
        )}
      `,
      cta: { label: 'Update payment', url: billingUrl },
    });

    await this.send(email, title, html, 'dunning-reminder');
  }

  async sendOnboardingNudge(
    email: string,
    data: {
      name: string;
      tenantName: string;
      missingSteps: string[];
      daysSinceSignup: number;
    },
  ): Promise<void> {
    const steps = data.missingSteps.join(' and ');
    const html = renderEmailLayout({
      preheader: 'Finish setting up your store',
      icon: 'document',
      title: 'Complete your SwiftPOS setup',
      subtitle: `${data.tenantName} is almost ready to sell.`,
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
          Hi ${this.escapeHtml(data.name)}, you signed up ${data.daysSinceSignup} days ago but still need to configure
          <strong>${this.escapeHtml(steps)}</strong>.
        </p>
        ${bulletList([
          'Add your first products so cashiers can ring sales',
          'Confirm store details and tax settings',
          'Invite team members when you are ready',
        ])}
      `,
      cta: { label: 'Continue setup', url: `${this.frontendUrl()}/onboarding` },
    });
    await this.send(email, 'Finish setting up SwiftPOS', html, 'onboarding-nudge');
  }

  async sendPlanLimitWarning(
    email: string,
    data: {
      name: string;
      tenantName: string;
      resource: 'users' | 'stores';
      used: number;
      limit: number;
      percent: number;
    },
  ): Promise<void> {
    const label = data.resource === 'users' ? 'team members' : 'stores';
    const html = renderEmailLayout({
      icon: 'document',
      title: `Approaching ${label} limit`,
      subtitle: `${data.tenantName} is at ${data.percent}% of your plan allowance.`,
      bodyHtml: infoBox([
        { label: 'Resource', value: label },
        { label: 'Used', value: `${data.used} / ${data.limit}` },
        { label: 'Usage', value: `${data.percent}%` },
      ]),
      cta: { label: 'Upgrade plan', url: `${this.frontendUrl()}/billing` },
    });
    await this.send(email, `Plan limit warning — ${label}`, html, 'plan-limit-warning');
  }

  async sendSupportSlaAlert(
    email: string,
    data: {
      ticketCount: number;
      oldestDays: number;
      tickets: { subject: string; email: string; name: string }[];
    },
  ): Promise<void> {
    const rows = data.tickets.map((t) => [t.subject, t.name, t.email]);
    const html = renderEmailLayout({
      icon: 'mail',
      title: 'Support SLA alert',
      subtitle: `${data.ticketCount} ticket(s) awaiting response for ${data.oldestDays}+ days.`,
      bodyHtml: dataTable(['Subject', 'Customer', 'Email'], rows),
      cta: { label: 'Open support queue', url: `${this.frontendUrl()}/admin/support` },
    });
    await this.send(
      email,
      `Support SLA — ${data.ticketCount} stale ticket(s)`,
      html,
      'support-sla-alert',
    );
  }

  async sendSupportReply(
    email: string,
    data: {
      customerName: string;
      originalSubject?: string;
      originalMessage: string;
      replyMessage: string;
    },
  ): Promise<void> {
    const subject = data.originalSubject
      ? `Re: ${data.originalSubject}`
      : 'Re: Your SwiftPOS support request';

    const html = renderEmailLayout({
      icon: 'mail',
      title: 'Support reply from SwiftPOS',
      subtitle: `Hi ${this.escapeHtml(data.customerName || 'there')},`,
      bodyHtml: `
        <p style="margin:0 0 16px;line-height:1.6;color:#374151;">${this.escapeHtml(data.replyMessage).replace(/\n/g, '<br/>')}</p>
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Your original message</p>
        <div style="margin:0;padding:16px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;font-size:14px;line-height:1.6;color:#374151;">${this.escapeHtml(data.originalMessage).replace(/\n/g, '<br/>')}</div>
      `,
      footerNote: 'Reply to this email if you need further help.',
    });

    await this.send(email, subject, html, 'support-reply');
  }
}
