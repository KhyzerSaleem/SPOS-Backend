/**
 * SwiftPOS transactional email templates — table-based layout, inline CSS for
 * broad client compatibility (Brevo/SMTP), with class-based dark-mode
 * overrides for clients that honor `prefers-color-scheme` (Apple/iOS Mail,
 * some Outlook.com, Fastmail). Visual language: minimal, whitespace-driven,
 * one clear CTA — matching current SaaS transactional-email conventions
 * (Stripe/Linear/Resend-era) rather than a marketing-style layout.
 *
 * Public API (renderEmailLayout, infoBox, otpCodeBlock, dataTable,
 * bulletList) is unchanged from the previous version — every call site in
 * email.service.ts works without modification.
 */

export const BRAND = {
  brand: '#EA580C',
  brandSoft: '#FB923C',
  brandHover: '#C2410C',
  bg: '#F4F3F0',
  bgWarm: '#FAFAF9',
  surface: '#FFFFFF',
  text: '#1C1917',
  textSecondary: '#57534E',
  muted: '#78716C',
  border: '#E7E5E4',
  borderSoft: '#F0EEEC',
  success: '#059669',
  warning: '#EA580C',
  danger: '#DC2626',
  ctaBg: '#C2410C',
  ctaText: '#FFFFFF',
};

/** Dark-mode counterparts, applied via @media (prefers-color-scheme: dark) with !important. */
const DARK = {
  bg: '#18181B',
  surface: '#1F1F23',
  surfaceRaised: '#27272B',
  text: '#F4F4F5',
  textSecondary: '#D4D4D8',
  muted: '#A1A1AA',
  border: '#3F3F46',
  borderSoft: '#333338',
  brandSoft: '#FDBA74',
};

export type EmailIcon = 'lock' | 'mail' | 'key' | 'check' | 'user' | 'document';

export interface EmailCta {
  label: string;
  url: string;
}

export interface EmailLayoutOptions {
  preheader?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  cta?: EmailCta;
  footerNote?: string;
  icon?: EmailIcon;
}

const FONT_STACK =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO_STACK = "ui-monospace,'SF Mono','Cascadia Code','Courier New',monospace";

const ICON_SVGS: Record<EmailIcon, string> = {
  lock: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="11" width="14" height="10" rx="2" stroke="${BRAND.brand}" stroke-width="1.75"/><path d="M8 11V8a4 4 0 118 0v3" stroke="${BRAND.brand}" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  mail: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="2" stroke="${BRAND.brand}" stroke-width="1.75"/><path d="M3 7l9 6 9-6" stroke="${BRAND.brand}" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  key: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="15" r="4" stroke="${BRAND.brand}" stroke-width="1.75"/><path d="M12 15h8m-3-3l3 3-3 3" stroke="${BRAND.brand}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="${BRAND.success}" stroke-width="1.75"/><path d="M8 12l2.5 2.5L16 9" stroke="${BRAND.success}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  user: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4" stroke="${BRAND.brand}" stroke-width="1.75"/><path d="M5 20c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="${BRAND.brand}" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  document: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 4h8l4 4v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="${BRAND.brand}" stroke-width="1.75"/><path d="M16 4v4h4M9 13h6M9 17h4" stroke="${BRAND.brand}" stroke-width="1.75" stroke-linecap="round"/></svg>`,
};

function renderHeroIcon(icon?: EmailIcon): string {
  if (!icon) return '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td align="center">
          <div class="sp-icon-badge" style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;background:${BRAND.bgWarm};border:1px solid ${BRAND.borderSoft};border-radius:12px;">
            ${ICON_SVGS[icon]}
          </div>
        </td>
      </tr>
    </table>`;
}

export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const year = new Date().getFullYear();
  const preheader = opts.preheader ?? opts.title;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(opts.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @media only screen and (max-width: 620px) {
      .sp-shell-pad { padding: 20px 16px 28px !important; }
      .sp-card-pad { padding: 28px 24px !important; }
      .sp-otp-code { font-size: 26px !important; letter-spacing: 5px !important; }
      .sp-otp-pad { padding: 14px 24px !important; }
      .sp-title { font-size: 20px !important; }
    }
    /* Dark-mode overrides for clients that honor prefers-color-scheme
       (Apple/iOS Mail, some Outlook.com, Fastmail). Inline styles remain the
       fallback everywhere else. */
    @media (prefers-color-scheme: dark) {
      .sp-body, .sp-shell-bg { background:${DARK.bg} !important; }
      .sp-card { background:${DARK.surface} !important; box-shadow:none !important; border:1px solid ${DARK.border} !important; }
      .sp-title, .sp-wordmark-text { color:${DARK.text} !important; }
      .sp-subtitle, .sp-body-text, .sp-muted { color:${DARK.muted} !important; }
      .sp-body-text-secondary { color:${DARK.textSecondary} !important; }
      .sp-icon-badge { background:${DARK.surfaceRaised} !important; border-color:${DARK.border} !important; }
      .sp-footer-border { border-top-color:${DARK.border} !important; }
      .sp-otp-box, .sp-info-box { background:${DARK.surfaceRaised} !important; border-color:${DARK.border} !important; }
      .sp-otp-code { color:${DARK.text} !important; }
      .sp-info-value, .sp-table-cell-strong { color:${DARK.text} !important; }
      .sp-info-divider { border-top-color:${DARK.border} !important; }
      .sp-table-head, .sp-table-cell { border-bottom-color:${DARK.borderSoft} !important; }
      .sp-table-cell { color:${DARK.textSecondary} !important; }
    }
  </style>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body class="sp-body" style="margin:0;padding:0;background:${BRAND.bg};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;color:${BRAND.text};">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sp-shell-bg" style="background:${BRAND.bg};">
    <tr>
      <td class="sp-shell-pad" align="center" style="padding:40px 24px 48px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sp-card" style="max-width:480px;background:${BRAND.surface};border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);">
          <tr>
            <td class="sp-card-pad" style="padding:36px 36px 28px;">
              <!-- Wordmark -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center">
                    <span class="sp-wordmark-text" style="font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.text};">Swift</span><span style="font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.brand};">POS</span>
                  </td>
                </tr>
              </table>

              ${renderHeroIcon(opts.icon)}

              ${opts.eyebrow ? `<p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.brand};text-align:center;">${escapeHtml(opts.eyebrow)}</p>` : ''}
              <h1 class="sp-title" style="margin:0 0 10px;font-size:21px;font-weight:700;line-height:1.35;letter-spacing:-0.015em;color:${BRAND.text};text-align:center;">${escapeHtml(opts.title)}</h1>
              ${opts.subtitle ? `<p class="sp-subtitle" style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${BRAND.muted};text-align:center;">${escapeHtml(opts.subtitle)}</p>` : '<div style="height:6px;font-size:0;line-height:0;">&nbsp;</div>'}

              <div class="sp-body-text-secondary" style="font-size:14px;line-height:1.6;color:${BRAND.textSecondary};text-align:center;">
                ${opts.bodyHtml}
              </div>

              ${
                opts.cta
                  ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
                <tr>
                  <td align="center" style="border-radius:999px;background:${BRAND.ctaBg};">
                    <a href="${escapeAttr(opts.cta.url)}" style="display:block;padding:13px 26px;font-size:14px;font-weight:600;color:${BRAND.ctaText};text-decoration:none;border-radius:999px;letter-spacing:0.01em;text-align:center;">${escapeHtml(opts.cta.label)}</a>
                  </td>
                </tr>
              </table>`
                  : ''
              }

              ${
                opts.footerNote
                  ? `
              <p class="sp-muted" style="margin:24px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center;">${opts.footerNote}</p>`
                  : ''
              }

              <!-- In-card footer -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                <tr>
                  <td class="sp-footer-border" style="padding-top:20px;border-top:1px solid ${BRAND.border};text-align:center;">
                    <p class="sp-muted" style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${BRAND.muted};">&copy; ${year} SwiftPOS</p>
                    <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                      <a href="mailto:support@swiftpos.io" style="color:${BRAND.brand};text-decoration:none;font-weight:500;">Need help? Contact support</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function infoBox(rows: { label: string; value: string }[]): string {
  const items = rows
    .map(
      (r, i) => `
      <tr>
        <td colspan="2" class="${i === 0 ? '' : 'sp-info-divider'}" style="padding:${i === 0 ? '0' : '10px'} 0 0;font-size:0;line-height:0;border-top:${i === 0 ? 'none' : `1px solid ${BRAND.borderSoft}`};">&nbsp;</td>
      </tr>
      <tr>
        <td class="sp-muted" style="padding:0 12px 0 0;font-size:12.5px;color:${BRAND.muted};width:42%;vertical-align:top;line-height:1.5;text-align:left;">${escapeHtml(r.label)}</td>
        <td class="sp-info-value" style="padding:0;font-size:12.5px;font-weight:600;color:${BRAND.text};vertical-align:top;line-height:1.5;text-align:right;">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
      <tr>
        <td class="sp-info-box" style="background:${BRAND.bg};border-radius:10px;padding:16px 18px;border:1px solid ${BRAND.borderSoft};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
        </td>
      </tr>
    </table>`;
}

export function otpCodeBlock(code: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td class="sp-otp-pad sp-otp-box" style="background:${BRAND.bg};border-radius:10px;padding:16px 30px;border:1px solid ${BRAND.borderSoft};">
                <p class="sp-muted" style="margin:0 0 6px;font-size:10.5px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${BRAND.muted};text-align:center;">Verification code</p>
                <span class="sp-otp-code" style="display:block;font-size:30px;font-weight:700;letter-spacing:9px;color:${BRAND.text};font-family:${MONO_STACK};direction:ltr;unicode-bidi:bidi-override;font-variant-numeric:tabular-nums;text-align:center;">${escapeHtml(code)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export function dataTable(
  headers: string[],
  rows: string[][],
  footerRow?: { label: string; value: string },
): string {
  const head = headers
    .map(
      (h, i) =>
        `<th class="sp-table-head" style="padding:0 0 9px;font-size:10.5px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${BRAND.muted};text-align:${i === headers.length - 1 ? 'right' : 'left'};border-bottom:1px solid ${BRAND.border};">${escapeHtml(h)}</th>`,
    )
    .join('');

  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, i) =>
              `<td class="sp-table-cell" style="padding:11px 0;font-size:12.5px;color:${BRAND.textSecondary};text-align:${i === row.length - 1 ? 'right' : 'left'};border-bottom:1px solid ${BRAND.borderSoft};line-height:1.5;">${escapeHtml(cell)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');

  const foot = footerRow
    ? `<tr><td colspan="${headers.length - 1}" class="sp-table-cell-strong" style="padding:14px 0 0;font-size:12.5px;font-weight:600;text-align:right;color:${BRAND.text};">${escapeHtml(footerRow.label)}</td><td style="padding:14px 0 0;font-size:14px;font-weight:700;text-align:right;color:${BRAND.brand};">${escapeHtml(footerRow.value)}</td></tr>`
    : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse;text-align:left;">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}${foot}</tbody>
    </table>`;
}

export function bulletList(items: string[]): string {
  const lis = items
    .map(
      (i) =>
        `<tr><td style="width:18px;padding:5px 0;vertical-align:top;text-align:left;"><span style="display:inline-block;width:5px;height:5px;background:${BRAND.brand};border-radius:50%;margin-top:7px;font-size:0;line-height:0;">&nbsp;</span></td><td class="sp-body-text-secondary" style="padding:5px 0;font-size:13.5px;line-height:1.6;color:${BRAND.textSecondary};text-align:left;">${escapeHtml(i)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0;">${lis}</table>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
