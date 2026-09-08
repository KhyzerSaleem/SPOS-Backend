export interface AutomationJobDefinition {
  name: string;
  label: string;
  description: string;
  cron: string;
  timeZone: string;
}

export const AUTOMATION_JOBS: AutomationJobDefinition[] = [
  {
    name: 'trial-expiry-notifications',
    label: 'Trial expiry reminders',
    description: 'Emails and in-app alerts at 3 days, 1 day, and on trial expiry.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'trial-expiry-enforcement',
    label: 'Trial expiry enforcement',
    description: 'Suspends subscriptions whose trial period has ended without upgrade.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'subscription-dunning',
    label: 'Subscription dunning',
    description: 'Payment failure reminders at 0, 3, 7, and 14 days overdue; suspends at day 14.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'renewal-reminders',
    label: 'Renewal reminders',
    description: 'Notifies owners 7, 3, and 1 days before subscription renewal.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'maintenance-window-transitions',
    label: 'Maintenance transitions',
    description: 'Hour-before, start, and end maintenance alerts.',
    cron: '*/5 * * * *',
    timeZone: 'UTC',
  },
  {
    name: 'maintenance-advance-notices',
    label: 'Maintenance advance notices',
    description: '30, 7, and 1 day advance maintenance notices.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'low-stock-digest',
    label: 'Low stock digest',
    description: 'Daily email and in-app digest for items at or below reorder point.',
    cron: '0 8 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'onboarding-nudge',
    label: 'Onboarding nudge',
    description: 'Reminds new tenants to finish setup if incomplete after 3 days.',
    cron: '0 10 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'held-order-cleanup',
    label: 'Held order cleanup',
    description: 'Removes POS held orders older than the retention window.',
    cron: '0 2 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'soft-delete-purge',
    label: 'Soft-delete purge',
    description: 'Permanently removes soft-deleted records past the retention period.',
    cron: '0 3 * * 0',
    timeZone: 'UTC',
  },
  {
    name: 'support-sla',
    label: 'Support SLA',
    description: 'Alerts admins on stale tickets and auto-archives very old submissions.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'weekly-sales-summary',
    label: 'Weekly sales summary',
    description: 'Monday morning sales snapshot emailed to tenant owners.',
    cron: '0 7 * * 1',
    timeZone: 'UTC',
  },
  {
    name: 'plan-limit-warnings',
    label: 'Plan limit warnings',
    description: 'Warns owners when user or store usage reaches 80% of plan limits.',
    cron: '0 9 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'customer-payment-due',
    label: 'Customer payment due alerts',
    description: 'Notifies finance and sales managers about due or overdue customer invoices.',
    cron: '0 8 * * *',
    timeZone: 'UTC',
  },
  {
    name: 'supplier-payable-due',
    label: 'Supplier payable due alerts',
    description: 'Notifies purchase and finance managers about due or overdue supplier invoices.',
    cron: '30 8 * * *',
    timeZone: 'UTC',
  },
];
