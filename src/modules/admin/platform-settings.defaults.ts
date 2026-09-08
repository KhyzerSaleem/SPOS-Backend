/** Default CMS content — seeded on first read if DB document is empty. */
export const DEFAULT_PLATFORM_SETTINGS = {
  key: 'platform',
  maintenanceMode: false,
  maintenanceMessage:
    'We are performing scheduled maintenance to improve your experience. The system will be back online shortly.',
  maintenanceEstimate: 'Less than 30 minutes',
  maintenanceScheduledStart: null,
  maintenanceScheduledEnd: null,
  maintenanceTimezone: 'UTC',
  maintenanceAutoEnable: true,
  maintenanceShowNotice: true,
  maintenanceApologyMessage:
    'We apologize for the disruption to your workflow during this maintenance window. Thank you for your patience while we improve SwiftPOS.',
  maintenanceNoticeMessage:
    'Upcoming scheduled maintenance — SwiftPOS will be temporarily unavailable. Please save your work before the window begins.',
  marketingBanner: {
    enabled: true,
    text: 'New: HRM self-service, BIR-ready receipts & barcode catalog lookup',
    linkLabel: 'Start free trial',
    linkHref: '/signup',
  },
  seo: {
    title: 'SwiftPOS — Cloud POS & Retail Management',
    description:
      'SwiftPOS is a production-ready cloud point-of-sale platform for retail and multi-store businesses. POS, inventory, HRM, reports, and more — live and available worldwide.',
    keywords: [
      'POS',
      'point of sale',
      'retail software',
      'inventory management',
      'SaaS POS',
      'multi-store',
    ],
    ogTitle: 'SwiftPOS — Cloud POS for Modern Retail',
    ogDescription: 'Sell faster, manage inventory, and grow with an all-in-one cloud POS platform.',
    siteName: 'SwiftPOS',
  },
  platformMatrix: {
    modules: [
      { id: 'pos', label: 'POS' },
      { id: 'inventory', label: 'Inventory' },
      { id: 'sales', label: 'Sales' },
      { id: 'people', label: 'People' },
      { id: 'reports', label: 'Reports' },
      { id: 'settings', label: 'Admin' },
    ],
    categories: [
      {
        name: 'Checkout & operations',
        rows: [
          { label: 'Barcode & SKU scanning', modules: ['pos', 'inventory'] },
          { label: 'Offline mode with auto-sync', modules: ['pos'] },
          { label: 'Split payments & held orders', modules: ['pos'] },
          { label: 'Thermal receipt printing', modules: ['pos', 'settings'] },
          { label: 'BIR / tax-compliant receipts', modules: ['pos', 'settings'] },
        ],
      },
      {
        name: 'Inventory & supply chain',
        rows: [
          { label: 'Multi-warehouse stock', modules: ['inventory'] },
          { label: 'Inter-store transfers', modules: ['inventory'] },
          { label: 'Batch & expiry tracking', modules: ['inventory'] },
          { label: 'Reorder alerts', modules: ['inventory'] },
          { label: 'GRN & purchase receiving', modules: ['sales', 'inventory'] },
        ],
      },
      {
        name: 'Customers & team',
        rows: [
          { label: 'Customer CRM & groups', modules: ['people'] },
          { label: 'Loyalty & credit limits', modules: ['people', 'pos'] },
          { label: 'Staff roles & permissions', modules: ['people', 'settings'] },
          { label: 'HRM: leave & attendance', modules: ['people'] },
          { label: 'Supplier management', modules: ['people', 'sales'] },
        ],
      },
      {
        name: 'Insights & control',
        rows: [
          { label: 'Sales & P&L reports', modules: ['reports'] },
          { label: 'VAT / tax reporting', modules: ['reports', 'settings'] },
          { label: 'Inventory valuation', modules: ['reports', 'inventory'] },
          { label: 'CSV & Excel export', modules: ['reports'] },
          { label: 'Multi-store configuration', modules: ['settings'] },
        ],
      },
    ],
  },
  productionMetrics: [
    {
      value: '2,000+',
      label: 'Active businesses',
      detail: 'Retail, F&B, wholesale, and multi-branch chains',
      icon: 'Building2',
      accent: 'from-brand-muted to-brand/10',
      featured: true,
    },
    {
      value: '5M+',
      label: 'Transactions / month',
      detail: 'Processed on production infrastructure',
      icon: 'Zap',
      accent: 'from-success-muted to-success/10',
      featured: false,
    },
    {
      value: '99.9%',
      label: 'Uptime SLA',
      detail: 'Multi-region cloud with automatic failover',
      icon: 'WifiOff',
      accent: 'from-brand-muted to-brand/10',
      featured: false,
    },
    {
      value: '< 2hr',
      label: 'Average go-live',
      detail: 'Guided onboarding and migration support',
      icon: 'Scan',
      accent: 'from-brand-muted to-brand/15',
      featured: false,
    },
  ],
  bentoFeatures: [
    {
      title: 'Fast Checkout',
      desc: 'Sub-second transactions with split payments and held orders.',
      icon: 'Zap',
      size: 'large',
    },
    {
      title: 'Barcode Scanning',
      desc: 'USB, Bluetooth, and camera scanners with catalog lookup.',
      icon: 'Scan',
      size: 'default',
    },
    {
      title: 'Multi-Warehouse',
      desc: 'Stock visibility and transfers across every location.',
      icon: 'Warehouse',
      size: 'default',
    },
    {
      title: 'Smart Alerts',
      desc: 'Low-stock and expiry notifications before they cost you.',
      icon: 'Bell',
      size: 'default',
    },
    {
      title: 'Invoicing',
      desc: 'Professional invoices with payment tracking built in.',
      icon: 'FileText',
      size: 'default',
    },
    {
      title: 'Customer CRM',
      desc: 'Profiles, loyalty, credit limits, and purchase history.',
      icon: 'UserCheck',
      size: 'default',
    },
    {
      title: '14+ Reports',
      desc: 'Sales, P&L, tax, inventory — export to CSV or Excel.',
      icon: 'LineChart',
      size: 'large',
    },
    {
      title: 'Role Permissions',
      desc: 'Granular access control for every staff member.',
      icon: 'Lock',
      size: 'default',
    },
    {
      title: 'Receipt Builder',
      desc: 'Branded thermal receipts with real tax breakdowns.',
      icon: 'Printer',
      size: 'default',
    },
  ],
  solutions: [
    {
      title: 'Retail Stores',
      desc: 'From boutiques to supermarkets — fast checkout, inventory tracking, customer loyalty, and real-time reporting.',
      icon: 'Store',
      features: [
        'Fast barcode checkout',
        'Customer loyalty',
        'Multi-category inventory',
        'Daily sales reports',
      ],
    },
    {
      title: 'Restaurants & Cafés',
      desc: 'Streamline orders, manage tables, track ingredients, and analyze your most profitable menu items.',
      icon: 'Utensils',
      features: [
        'Table management',
        'Ingredient tracking',
        'Split billing',
        'Menu performance analytics',
      ],
    },
    {
      title: 'Wholesale & Distribution',
      desc: 'Handle bulk orders, tiered pricing, shipments, and supplier relationships at scale.',
      icon: 'Boxes',
      features: [
        'Bulk order processing',
        'Tiered pricing',
        'GRN management',
        'Supplier performance tracking',
      ],
    },
    {
      title: 'Multi-Branch Chains',
      desc: 'Centralized control with branch-level autonomy. Real-time sync and consolidated reporting.',
      icon: 'GitBranch',
      features: [
        'Centralized dashboard',
        'Inter-branch transfers',
        'Unified reporting',
        'Branch-level permissions',
      ],
    },
  ],
  contactHighlights: [
    { value: '500+', label: 'Businesses onboarded' },
    { value: '< 2hr', label: 'Avg. setup time' },
    { value: '99.9%', label: 'Uptime guaranteed' },
    { value: 'Free', label: 'Migration support' },
  ],
  trustLogos: {
    enabled: true,
    heading: 'Trusted by modern retail teams',
    logos: [
      { name: 'Logo 1', imageUrl: '', enabled: true },
      { name: 'Logo 2', imageUrl: '', enabled: true },
      { name: 'Logo 3', imageUrl: '', enabled: true },
      { name: 'Logo 4', imageUrl: '', enabled: true },
      { name: 'Logo 5', imageUrl: '', enabled: true },
      { name: 'Logo 6', imageUrl: '', enabled: true },
    ],
  },
  preFooterCta: {
    title: 'Ready to modernize your retail operations?',
    subtitle:
      'Join thousands of operators running on SwiftPOS. Start your 14-day trial — no credit card required.',
    primaryLabel: 'Start free trial',
    primaryHref: '/signup',
    secondaryLabel: 'Talk to sales',
    secondaryHref: '#contact',
  },
};
