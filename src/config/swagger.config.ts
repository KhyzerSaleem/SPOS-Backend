import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { SWAGGER_PATH } from './app.constants';

const SWAGGER_CUSTOM_CSS = `
  :root {
    --bg: #1c1917; --bg-elevated: #292524; --text: #fafaf9;
    --text-muted: #a8a29e; --brand: #EA580C; --brand-foreground: #FB923C; --border: #44403c;
  }
  body { background: var(--bg) !important; }
  .swagger-ui { font-family: 'Inter', -apple-system, sans-serif !important; }
  .swagger-ui .topbar { display: none !important; }
  .swagger-ui .info .title { color: var(--text) !important; font-size: 28px !important; font-weight: 700 !important; }
  .swagger-ui .info .description p { color: var(--text-muted) !important; }
  .swagger-ui .scheme-container { background: var(--bg-elevated) !important; border-radius: 10px; border: 1px solid var(--border) !important; box-shadow: none !important; padding: 16px !important; }
  .swagger-ui .opblock-tag { color: var(--text) !important; border-bottom: 1px solid var(--border) !important; }
  .swagger-ui .opblock { border-radius: 8px !important; border: 1px solid var(--border) !important; margin-bottom: 8px !important; box-shadow: none !important; }
  .swagger-ui .opblock.opblock-get { background: rgba(59,130,246,0.05) !important; border-color: rgba(59,130,246,0.3) !important; }
  .swagger-ui .opblock.opblock-post { background: rgba(34,197,94,0.05) !important; border-color: rgba(34,197,94,0.3) !important; }
  .swagger-ui .opblock.opblock-put { background: rgba(234, 88, 12, 0.05) !important; border-color: rgba(234, 88, 12, 0.3) !important; }
  .swagger-ui .opblock.opblock-delete { background: rgba(239,68,68,0.05) !important; border-color: rgba(239,68,68,0.3) !important; }
  .swagger-ui .opblock.opblock-patch { background: rgba(168,85,247,0.05) !important; border-color: rgba(168,85,247,0.3) !important; }
  .swagger-ui .opblock .opblock-summary-method { border-radius: 6px !important; font-size: 12px !important; font-weight: 700 !important; min-width: 65px !important; padding: 4px 10px !important; }
  .swagger-ui .opblock .opblock-summary-path { color: var(--text) !important; font-family: 'JetBrains Mono', monospace !important; font-size: 13px !important; }
  .swagger-ui .opblock .opblock-summary-description { color: var(--text-muted) !important; }
  .swagger-ui table thead tr th { color: var(--text-muted) !important; border-bottom: 1px solid var(--border) !important; }
  .swagger-ui table tbody tr td { color: var(--text) !important; border-bottom: 1px solid var(--border) !important; }
  .swagger-ui .model-box { background: var(--bg-elevated) !important; border-radius: 8px !important; }
  .swagger-ui .model, .swagger-ui .model-title { color: var(--text) !important; }
  .swagger-ui input[type=text], .swagger-ui textarea, .swagger-ui select { background: var(--bg) !important; color: var(--text) !important; border: 1px solid var(--border) !important; border-radius: 6px !important; }
  .swagger-ui .btn { border-radius: 6px !important; font-weight: 600 !important; }
  .swagger-ui .btn.authorize, .swagger-ui .btn.execute { background: var(--brand) !important; color: #fff !important; border-color: var(--brand) !important; }
  .swagger-ui pre { background: var(--bg-elevated) !important; color: var(--text) !important; border-radius: 6px !important; }
  .swagger-ui .wrapper { max-width: 1200px !important; }
  .swagger-ui .parameter__name { color: var(--text) !important; }
  .swagger-ui .parameter__type { color: var(--text-muted) !important; }
  .swagger-ui .opblock-section-header { background: var(--bg-elevated) !important; border-radius: 4px; }
  .swagger-ui .opblock-section-header h4 { color: var(--text) !important; }
  .swagger-ui .arrow, .swagger-ui svg.arrow { fill: var(--text-muted) !important; }
`;

export function isSwaggerEnabled(nodeEnv?: string, enableSwaggerFlag?: string): boolean {
  return nodeEnv !== 'production' || enableSwaggerFlag === 'true';
}

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SwiftPOS API')
    .setDescription(
      'Enterprise SaaS POS Backend — Authentication, POS, Inventory, Sales, Purchases, Reports, Billing, Admin',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Store-Id' }, 'store-id')
    .addTag('Auth', 'Authentication & user management')
    .addTag('POS', 'Point of Sale operations')
    .addTag('Products', 'Product catalog management')
    .addTag('Inventory', 'Stock & warehouse management')
    .addTag('Sales', 'Sales orders & invoices')
    .addTag('Purchases', 'Purchase orders & GRN')
    .addTag('Finance', 'Accounts, journal entries & financial reports')
    .addTag('HRM', 'Employee, attendance & payroll management')
    .addTag('Reports', 'Analytics & reporting')
    .addTag('Billing', 'Subscription & payment management')
    .addTag('Admin', 'Super admin operations')
    .addTag('Notifications', 'In-app notifications')
    .addTag('Settings', 'Tenant configuration')
    .addTag('Roles', 'Role & permission management')
    .addTag('Health', 'System health check')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    customSiteTitle: 'SwiftPOS API Docs',
    customfavIcon: '/favicon.ico',
    customCss: SWAGGER_CUSTOM_CSS,
  });
}
